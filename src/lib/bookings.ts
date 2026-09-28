/**
 * True To Detail Job System — booking data access.
 *
 * Mirrors FixNow Mechanics Tracking's lib/tracking.ts split: the customer's
 * own reads/writes go through plain RLS-authenticated calls (they're a real
 * signed-in user here, unlike FixNow's anonymous token-gated customer), and
 * every status transition past creation happens either through a
 * detailer_* RPC (src/lib/detailers.ts) or a staff-only authenticated write.
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { getMyCustomerId } from "./customers";
import type { AddonId, VehicleSize } from "./constants";

export type BookingStatus =
  | "confirmed"
  | "assigned"
  | "en_route"
  | "arrived"
  | "check_in"
  | "in_progress"
  | "qc"
  | "handover"
  | "completed"
  | "cancelled";

export const ACTIVE_STATUSES: BookingStatus[] = [
  "confirmed",
  "assigned",
  "en_route",
  "arrived",
  "check_in",
  "in_progress",
  "qc",
  "handover",
];

/** True from the moment a detailer is assigned to the moment the job wraps — the live job window. */
export const LIVE_JOB_STATUSES: BookingStatus[] = [
  "assigned",
  "en_route",
  "arrived",
  "check_in",
  "in_progress",
  "qc",
  "handover",
];

export interface Booking {
  id: string;
  booking_reference: string;
  customer_id: string;
  vehicle_id: string | null;
  address_id: string | null;
  fulfilment_type: "MOBILE" | "STUDIO";

  service_address_line1: string;
  service_address_line2: string | null;
  service_address_city: string | null;
  service_postcode: string;
  destination_lat: number | null;
  destination_lng: number | null;

  vehicle_registration: string;
  vehicle_description: string | null;

  package_id: string;
  package_name: string;
  vehicle_size: VehicleSize;
  addon_ids: string[];
  addon_labels: string[];
  price: number;

  scheduled_start: string;
  estimated_duration_minutes: number;
  travel_time_minutes: number | null;

  assigned_detailer_id: string | null;

  status: BookingStatus;

  customer_notes: string | null;
  internal_notes: string | null;

  tracking_active: boolean;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: string | null;

  created_at: string;
  assigned_at: string | null;
  en_route_at: string | null;
  arrived_at: string | null;
  check_in_at: string | null;
  in_progress_at: string | null;
  qc_at: string | null;
  handover_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
}

export interface AssignedDetailerSummary {
  id: string;
  name: string;
  photo_url: string | null;
  phone: string | null;
  job_title: string | null;
  vehicle_description: string | null;
  link_token: string;
}

export type BookingWithDetailer = Booking & { detailer: AssignedDetailerSummary | null };

const TABLE = "bookings";
const WITH_DETAILER_SELECT =
  "*, detailer:detailers(id, name, photo_url, phone, job_title, vehicle_description, link_token)";

function dbError(error: PostgrestError, fallback: string): Error {
  return new Error(error.message ? `${fallback} (${error.message})` : fallback, { cause: error });
}

// ---------------------------------------------------------------------------
// Customer-facing
// ---------------------------------------------------------------------------

export async function listMyBookings(): Promise<BookingWithDetailer[]> {
  const customerId = await getMyCustomerId();
  if (!customerId) return [];
  // Explicit filter, not just RLS — see the same note on listMyAddresses:
  // a staff caller's RLS grant is "any row", so without this a staff
  // account would get every customer's bookings back instead of their own.
  const { data, error } = await supabase
    .from(TABLE)
    .select(WITH_DETAILER_SELECT)
    .eq("customer_id", customerId)
    .order("scheduled_start", { ascending: false });
  if (error) throw dbError(error, "Couldn't load your bookings.");
  return (data ?? []) as unknown as BookingWithDetailer[];
}

export async function getMyBookingById(id: string): Promise<BookingWithDetailer> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(WITH_DETAILER_SELECT)
    .eq("id", id)
    .single();
  if (error) throw dbError(error, "Couldn't load this booking.");
  return data as unknown as BookingWithDetailer;
}

export interface CreateBookingInput {
  vehicle_id?: string | null | undefined;
  vehicle_registration: string;
  vehicle_description?: string | undefined;

  address_id?: string | null | undefined;
  service_address_line1: string;
  service_address_line2?: string | undefined;
  service_address_city?: string | undefined;
  service_postcode: string;
  destination_lat?: number | undefined;
  destination_lng?: number | undefined;

  package_id: string;
  package_name: string;
  vehicle_size: VehicleSize;
  addon_ids: AddonId[];
  addon_labels: string[];
  price: number;

  scheduled_start: string;
  estimated_duration_minutes: number;

  customer_notes?: string | undefined;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const customerId = await getMyCustomerId();
  if (!customerId) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...input, customer_id: customerId, status: "confirmed" })
    .select("*")
    .single();
  if (error) throw dbError(error, "Couldn't create this booking.");
  return data as Booking;
}

export async function cancelOwnBooking(id: string, reason = "Customer cancelled"): Promise<void> {
  const { error } = await supabase.rpc("cancel_own_booking", {
    p_booking_id: id,
    p_reason: reason,
  });
  if (error) throw new Error(error.message || "Couldn't cancel this booking.", { cause: error });
}

// ---------------------------------------------------------------------------
// Staff-facing
// ---------------------------------------------------------------------------

export async function listBookings(): Promise<BookingWithDetailer[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(WITH_DETAILER_SELECT)
    .order("scheduled_start", { ascending: true });
  if (error) throw dbError(error, "Couldn't load bookings.");
  return (data ?? []) as unknown as BookingWithDetailer[];
}

export async function getBookingById(id: string): Promise<BookingWithDetailer> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(WITH_DETAILER_SELECT)
    .eq("id", id)
    .single();
  if (error) throw dbError(error, "Couldn't load this booking.");
  return data as unknown as BookingWithDetailer;
}

/** Staff-only: a specific customer's booking history, for the admin customer detail page. */
export async function getCustomerBookings(customerId: string): Promise<BookingWithDetailer[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(WITH_DETAILER_SELECT)
    .eq("customer_id", customerId)
    .order("scheduled_start", { ascending: false });
  if (error) throw dbError(error, "Couldn't load this customer's bookings.");
  return (data ?? []) as unknown as BookingWithDetailer[];
}

export interface StaffCreateBookingInput extends CreateBookingInput {
  customer_id: string;
}

export async function createBookingForCustomer(input: StaffCreateBookingInput): Promise<Booking> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...input, status: "confirmed" })
    .select("*")
    .single();
  if (error) throw dbError(error, "Couldn't create this booking.");
  return data as Booking;
}

export async function assignDetailer(
  bookingId: string,
  detailerId: string,
  travelTimeMinutes?: number | null,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      assigned_detailer_id: detailerId,
      status: "assigned",
      assigned_at: new Date().toISOString(),
      ...(travelTimeMinutes !== undefined ? { travel_time_minutes: travelTimeMinutes } : {}),
    })
    .eq("id", bookingId);
  if (error) throw dbError(error, "Couldn't assign a detailer to this job.");
}

export async function setTravelTimeMinutes(
  bookingId: string,
  minutes: number | null,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ travel_time_minutes: minutes })
    .eq("id", bookingId);
  if (error) throw dbError(error, "Couldn't update travel time.");
}

export const CANCELLATION_REASONS = [
  "Customer cancelled",
  "Rescheduled",
  "Detailer unavailable",
  "Weather / access issue",
  "Other",
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export async function cancelBooking(id: string, reason: CancellationReason): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      tracking_active: false,
      current_lat: null,
      current_lng: null,
    })
    .eq("id", id);
  if (error) throw dbError(error, "Couldn't cancel this booking.");
}

export interface StaffUpdateBookingInput {
  service_address_line1?: string;
  service_address_line2?: string | null;
  service_address_city?: string | null;
  service_postcode?: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  vehicle_registration?: string;
  vehicle_description?: string | null;
  scheduled_start?: string;
  estimated_duration_minutes?: number;
  internal_notes?: string | null;
}

export async function updateBookingDetails(
  id: string,
  patch: StaffUpdateBookingInput,
): Promise<void> {
  const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
  if (error) throw dbError(error, "Couldn't update this booking.");
}

// ---------------------------------------------------------------------------
// Live ETA — see supabase/functions/get-eta. Same "no fabricated ETAs" rule
// as FixNow: null means "no routing ETA available", never an error to
// surface — callers fall back to comparing real clock times instead.
// ---------------------------------------------------------------------------
export interface BookingEta {
  durationSeconds: number;
  distanceMeters: number;
}

export async function getBookingEta(bookingId: string): Promise<BookingEta | null> {
  const { data, error } = await supabase.functions.invoke<{
    duration_seconds?: number;
    distance_meters?: number;
  }>("get-eta", { body: { bookingId } });
  if (error || data?.duration_seconds == null || data?.distance_meters == null) return null;
  return { durationSeconds: data.duration_seconds, distanceMeters: data.distance_meters };
}
