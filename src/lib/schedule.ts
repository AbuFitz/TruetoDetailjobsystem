/**
 * Travel-time estimation for the admin schedule's "↓ 18 min travel" gaps
 * between consecutive jobs on a detailer's day. Two tiers, same honesty
 * principle as FixNow's ETA rule (see lib/format.ts): prefer a real routing
 * estimate when it's available, and when it's not, say so rather than
 * silently passing off a straight-line guess as equivalent — the fallback
 * estimate is clearly labelled "approx." wherever it's rendered.
 */
import { supabase } from "./supabase";
import { distanceMeters, type LatLng } from "./geo";

const AVERAGE_URBAN_SPEED_KMH = 34;

/** Straight-line-distance-based fallback, deliberately conservative and always labelled "approx." in the UI. */
export function estimateTravelMinutesFallback(from: LatLng, to: LatLng): number {
  const km = distanceMeters(from, to) / 1000;
  // +6 min fixed overhead for parking/setting off, on top of straight-line drive time.
  return Math.max(5, Math.round((km / AVERAGE_URBAN_SPEED_KMH) * 60 + 6));
}

export interface RouteEta {
  durationMinutes: number;
  distanceMiles: number;
}

/** Real, routing-based travel time between two points, via the get-eta Edge Function (staff-only). Null if unavailable. */
export async function getRouteEta(from: LatLng, to: LatLng): Promise<RouteEta | null> {
  const { data, error } = await supabase.functions.invoke<{
    duration_seconds?: number;
    distance_meters?: number;
  }>("get-eta", {
    body: { fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng },
  });
  if (error || data?.duration_seconds == null || data?.distance_meters == null) return null;
  return {
    durationMinutes: Math.round(data.duration_seconds / 60),
    distanceMiles: Math.round((data.distance_meters / 1609.34) * 10) / 10,
  };
}
