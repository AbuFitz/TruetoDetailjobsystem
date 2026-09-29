/**
 * True To Detail Job System — detailer profiles + the detailer's own mobile
 * job workflow.
 *
 * Two halves, mirroring FixNow Mechanics Tracking's lib/engineers.ts:
 *   - Staff CRUD (profiles, photo upload) uses the authenticated Supabase
 *     client directly — RLS grants staff full access to `detailers`.
 *   - The detailer's own flow (queue, journey, check-in, stage checklist,
 *     handover) is unauthenticated and goes entirely through the
 *     detailer_* RPCs, gated by their persistent link_token.
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { BookingStatus } from "./bookings";
import type { DetailStageKey } from "./constants";

export interface Detailer {
  id: string;
  link_token: string;
  name: string;
  phone: string | null;
  job_title: string | null;
  bio: string | null;
  vehicle_description: string | null;
  photo_url: string | null;
  active: boolean;
  created_at: string;
}

const TABLE = "detailers";
const PHOTO_BUCKET = "detailer-photos";

function dbError(error: PostgrestError, fallback: string): Error {
  return new Error(error.message ? `${fallback} (${error.message})` : fallback, { cause: error });
}

function rpcError(error: PostgrestError, fallback: string): Error {
  return new Error(error.message || fallback, { cause: error });
}

// ---------------------------------------------------------------------------
// Staff: detailer profile CRUD
// ---------------------------------------------------------------------------

export async function listDetailers(): Promise<Detailer[]> {
  const { data, error } = await supabase.from(TABLE).select("*").order("name", { ascending: true });
  if (error) throw dbError(error, "Couldn't load detailer profiles.");
  return (data ?? []) as Detailer[];
}

export async function getDetailerById(id: string): Promise<Detailer> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
  if (error) throw dbError(error, "Couldn't load this detailer profile.");
  return data as Detailer;
}

export interface DetailerInput {
  name: string;
  phone?: string | undefined;
  job_title?: string | undefined;
  bio?: string | undefined;
  vehicle_description?: string | undefined;
  photo_url?: string | undefined;
}

export async function createDetailer(input: DetailerInput): Promise<Detailer> {
  const { data, error } = await supabase.from(TABLE).insert(input).select("*").single();
  if (error) throw dbError(error, "Couldn't create this detailer profile.");
  return data as Detailer;
}

export interface DetailerUpdateInput {
  name?: string;
  phone?: string | null;
  job_title?: string | null;
  bio?: string | null;
  vehicle_description?: string | null;
  photo_url?: string;
  active?: boolean;
}

export async function updateDetailer(id: string, patch: DetailerUpdateInput): Promise<Detailer> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw dbError(error, "Couldn't update this detailer profile.");
  return data as Detailer;
}

export async function resizeImageFile(file: File, maxDim = 512, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  return blob ?? file;
}

export async function uploadDetailerPhoto(file: File): Promise<string> {
  const resized = await resizeImageFile(file);
  const path = `${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, resized, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw new Error(`Couldn't upload photo (${uploadError.message})`);
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Universal Google Maps directions link — one tap to turn-by-turn navigation. */
export function navigationUrlFor(job: {
  destination_lat: number | null;
  destination_lng: number | null;
  service_address_line1: string;
  service_postcode: string;
}): string {
  const destination =
    job.destination_lat != null && job.destination_lng != null
      ? `${job.destination_lat},${job.destination_lng}`
      : `${job.service_address_line1}, ${job.service_postcode}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

// ---------------------------------------------------------------------------
// Detailer's own flow — unauthenticated, token-gated RPCs
// ---------------------------------------------------------------------------

export interface DetailerProfile {
  name: string;
  phone: string | null;
  job_title: string | null;
  photo_url: string | null;
  vehicle_description: string | null;
}

export type DetailerJobStatus = Extract<
  BookingStatus,
  "assigned" | "en_route" | "arrived" | "check_in" | "in_progress" | "qc" | "handover"
>;

export interface DetailerJob {
  id: string;
  booking_reference: string;
  customer_first_name: string;
  customer_phone: string | null;
  vehicle_registration: string;
  vehicle_description: string | null;
  service_address_line1: string;
  service_address_line2: string | null;
  service_address_city: string | null;
  service_postcode: string;
  destination_lat: number | null;
  destination_lng: number | null;
  scheduled_start: string;
  estimated_duration_minutes: number;
  package_name: string;
  status: DetailerJobStatus;
  customer_notes: string | null;
  internal_notes: string | null;
  tracking_active: boolean;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: string | null;
}

export interface DetailerJobHistoryItem {
  id: string;
  booking_reference: string;
  vehicle_registration: string;
  vehicle_description: string | null;
  scheduled_start: string;
  status: BookingStatus;
  cancellation_reason: string | null;
}

export interface StageProgress {
  stage_key: DetailStageKey;
  completed_at: string | null;
}

export async function getDetailerProfile(token: string): Promise<DetailerProfile | null> {
  const { data, error } = await supabase.rpc("get_detailer_profile", { p_token: token });
  if (error) throw rpcError(error, "Couldn't load this detailer link.");
  const rows = data as DetailerProfile[] | null;
  return rows && rows.length > 0 ? (rows[0] ?? null) : null;
}

export async function getDetailerJobs(token: string): Promise<DetailerJob[]> {
  const { data, error } = await supabase.rpc("get_detailer_jobs", { p_token: token });
  if (error) throw rpcError(error, "Couldn't load your jobs.");
  return (data ?? []) as DetailerJob[];
}

export async function getDetailerJobHistory(token: string): Promise<DetailerJobHistoryItem[]> {
  const { data, error } = await supabase.rpc("get_detailer_job_history", { p_token: token });
  if (error) throw rpcError(error, "Couldn't load your job history.");
  return (data ?? []) as DetailerJobHistoryItem[];
}

export async function getDetailerJobStages(
  token: string,
  bookingId: string,
): Promise<StageProgress[]> {
  const { data, error } = await supabase.rpc("get_detailer_job_stages", {
    p_token: token,
    p_booking_id: bookingId,
  });
  if (error) throw rpcError(error, "Couldn't load the detail checklist.");
  return (data ?? []) as StageProgress[];
}

export async function detailerStartJourney(
  token: string,
  bookingId: string,
  position: { lat: number; lng: number },
): Promise<void> {
  const { error } = await supabase.rpc("detailer_start_journey", {
    p_token: token,
    p_booking_id: bookingId,
    p_lat: position.lat,
    p_lng: position.lng,
  });
  if (error) throw rpcError(error, "Couldn't start the journey.");
}

export async function detailerUpdateLocation(
  token: string,
  bookingId: string,
  position: { lat: number; lng: number },
  etaSeconds?: number | null,
): Promise<void> {
  const { error } = await supabase.rpc("detailer_update_location", {
    p_token: token,
    p_booking_id: bookingId,
    p_lat: position.lat,
    p_lng: position.lng,
    ...(etaSeconds != null ? { p_eta_seconds: etaSeconds } : {}),
  });
  if (error) throw rpcError(error, "Couldn't update your location.");
}

export async function detailerMarkArrived(token: string, bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("detailer_mark_arrived", {
    p_token: token,
    p_booking_id: bookingId,
  });
  if (error) throw rpcError(error, "Couldn't mark this job as arrived.");
}

export async function detailerStartCheckIn(token: string, bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("detailer_start_check_in", {
    p_token: token,
    p_booking_id: bookingId,
  });
  if (error) throw rpcError(error, "Couldn't start check-in.");
}

export interface SubmitCheckInInput {
  mileage: number | null;
  exteriorDamageNotes: string;
  wheelDamageNotes: string;
  interiorConditionNotes: string;
  valuablesNotes: string;
  customerRequests: string;
  accessNotes: string;
  waterAvailable: boolean | null;
  electricAvailable: boolean | null;
  vehiclePositionNotes: string;
  blockingIssue: string;
}

export async function detailerSubmitCheckIn(
  token: string,
  bookingId: string,
  input: SubmitCheckInInput,
): Promise<void> {
  const { error } = await supabase.rpc("detailer_submit_check_in", {
    p_token: token,
    p_booking_id: bookingId,
    p_mileage: input.mileage,
    p_exterior_damage_notes: input.exteriorDamageNotes,
    p_wheel_damage_notes: input.wheelDamageNotes,
    p_interior_condition_notes: input.interiorConditionNotes,
    p_valuables_notes: input.valuablesNotes,
    p_customer_requests: input.customerRequests,
    p_access_notes: input.accessNotes,
    p_water_available: input.waterAvailable,
    p_electric_available: input.electricAvailable,
    p_vehicle_position_notes: input.vehiclePositionNotes,
    p_blocking_issue: input.blockingIssue,
  });
  if (error) throw rpcError(error, "Couldn't save the check-in.");
}

export async function detailerAddCheckInPhoto(
  token: string,
  bookingId: string,
  url: string,
  caption?: string,
): Promise<void> {
  const { error } = await supabase.rpc("detailer_add_check_in_photo", {
    p_token: token,
    p_booking_id: bookingId,
    p_url: url,
    p_caption: caption ?? null,
  });
  if (error) throw rpcError(error, "Couldn't attach this photo.");
}

export async function uploadCheckInPhoto(file: File): Promise<string> {
  const resized = await resizeImageFile(file, 1600, 0.82);
  const path = `${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("check-in-photos")
    .upload(path, resized, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw new Error(`Couldn't upload photo (${uploadError.message})`);
  const { data } = supabase.storage.from("check-in-photos").getPublicUrl(path);
  return data.publicUrl;
}

export async function detailerCustomerAck(
  token: string,
  bookingId: string,
  customerName: string,
): Promise<void> {
  const { error } = await supabase.rpc("detailer_customer_ack", {
    p_token: token,
    p_booking_id: bookingId,
    p_customer_name: customerName,
  });
  if (error) throw rpcError(error, "Couldn't record the customer's acknowledgement.");
}

export async function detailerToggleStage(
  token: string,
  bookingId: string,
  stageKey: DetailStageKey,
  completed: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("detailer_toggle_stage", {
    p_token: token,
    p_booking_id: bookingId,
    p_stage_key: stageKey,
    p_completed: completed,
  });
  if (error) throw rpcError(error, "Couldn't update the detail checklist.");
}

export async function detailerStartHandover(token: string, bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("detailer_start_handover", {
    p_token: token,
    p_booking_id: bookingId,
  });
  if (error) throw rpcError(error, "Couldn't start handover.");
}

export async function detailerCompleteBooking(token: string, bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("detailer_complete_booking", {
    p_token: token,
    p_booking_id: bookingId,
  });
  if (error) throw rpcError(error, "Couldn't complete this job.");
}

/** Finish the job in one step: every checklist item must be ticked; the name of who the car was handed back to is optional. */
export async function detailerFinishJob(
  token: string,
  bookingId: string,
  customerName?: string,
): Promise<void> {
  const { error } = await supabase.rpc("detailer_finish_job", {
    p_token: token,
    p_booking_id: bookingId,
    p_customer_name: customerName?.trim() || null,
  });
  if (error) throw rpcError(error, "Couldn't finish this job.");
}
