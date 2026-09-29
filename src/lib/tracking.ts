/**
 * Public tracking: one booking, read by its private link token through a
 * database function that returns only what a customer needs to follow the job
 * (no street address, phone number, email or surname).
 */
import { supabase } from "./supabase";
import type { BookingStatus } from "./bookings";

export interface TrackedBooking {
  reference: string;
  status: BookingStatus;
  source: "portal" | "staff" | "website";
  package_name: string;
  addon_labels: string[] | null;
  price: number | null;
  vehicle_description: string | null;
  vehicle_registration: string;
  scheduled_start: string;
  estimated_duration_minutes: number;
  service_city: string | null;
  service_postcode: string;
  customer_first_name: string | null;
  customer_has_account: boolean;
  created_at: string;
  en_route_at: string | null;
  arrived_at: string | null;
  in_progress_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  detailer: {
    first_name: string;
    job_title: string | null;
    photo_url: string | null;
    vehicle_description: string | null;
  } | null;
  tracking: {
    lat: number | null;
    lng: number | null;
    updated_at: string | null;
    destination_lat: number | null;
    destination_lng: number | null;
    eta_seconds: number | null;
    eta_updated_at: string | null;
  } | null;
  stages: { key: string; done: boolean }[];
}

export async function getTrackedBooking(token: string): Promise<TrackedBooking | null> {
  const { data, error } = await supabase.rpc("get_tracked_booking", { p_token: token });
  if (error) throw new Error("Couldn't load this booking.", { cause: error });
  return (data as TrackedBooking | null) ?? null;
}
