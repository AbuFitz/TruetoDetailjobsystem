import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface CheckIn {
  id: string;
  booking_id: string;
  mileage: number | null;
  exterior_damage_notes: string | null;
  wheel_damage_notes: string | null;
  interior_condition_notes: string | null;
  valuables_notes: string | null;
  customer_requests: string | null;
  access_notes: string | null;
  water_available: boolean | null;
  electric_available: boolean | null;
  vehicle_position_notes: string | null;
  blocking_issue: string | null;
  created_at: string;
  customer_ack_at: string | null;
  customer_ack_name: string | null;
}

export interface CheckInPhoto {
  id: string;
  check_in_id: string;
  url: string;
  caption: string | null;
  created_at: string;
}

function dbError(error: PostgrestError, fallback: string): Error {
  return new Error(error.message ? `${fallback} (${error.message})` : fallback, { cause: error });
}

/** Read-only — for the customer's booking detail page and the staff admin console. */
export async function getCheckInForBooking(bookingId: string): Promise<CheckIn | null> {
  const { data, error } = await supabase
    .from("check_ins")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) throw dbError(error, "Couldn't load the check-in record.");
  return data as CheckIn | null;
}

export async function listCheckInPhotos(checkInId: string): Promise<CheckInPhoto[]> {
  const { data, error } = await supabase
    .from("check_in_photos")
    .select("*")
    .eq("check_in_id", checkInId)
    .order("created_at", { ascending: true });
  if (error) throw dbError(error, "Couldn't load check-in photos.");
  return (data ?? []) as CheckInPhoto[];
}
