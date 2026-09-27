// Supabase Edge Function: get-eta
//
// Returns a real, routing-based driving-time estimate from the detailer's
// current live position to the customer's service address — ported from
// FixNow Mechanics Tracking's get-eta, which is the one place that app
// allows an ETA at all, precisely because it asks an actual routing engine
// (real roads, real turn restrictions) instead of guessing from straight-
// line distance and an assumed speed. Same rule holds here: nowhere else in
// this app should fabricate a travel-time estimate.
//
// Used for two things:
//   1. The customer's "Your detailer is on the way — estimated arrival
//      10:12 AM" card (booking-scoped: resolves a booking the caller can
//      actually read, via their own Supabase Auth JWT).
//   2. The admin schedule's "↓ 18 min travel" gaps between two jobs
//      (point-to-point: any two lat/lngs, gated by a valid staff JWT since
//      only the authenticated admin console renders the schedule).
//
// Uses OpenRouteService's hosted Directions API (openrouteservice.org) — no
// server to run, just a free-tier API key. Calls api.heigit.org (HeiGIT
// gGmbH runs both api.openrouteservice.org and api.heigit.org on the same
// backend with the same key; heigit.org is the one their own dashboard says
// isn't being deprecated).
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_ANON_KEY — injected automatically.
//   ORS_API_KEY — a free API key from https://openrouteservice.org/dev/#/signup
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

const ORS_DIRECTIONS_URL = "https://api.heigit.org/openrouteservice/v2/directions/driving-car";

interface OrsDirectionsResponse {
  routes?: Array<{ summary: { distance: number; duration: number } }>;
  error?: string | { message?: string };
}

interface RequestBody {
  // Booking-scoped mode: resolves current/destination coordinates itself
  // from a booking the caller's own JWT can read (RLS-enforced), never from
  // client-supplied coordinates.
  bookingId?: string;
  // Point-to-point mode: only for an authenticated (staff) caller — used by
  // the admin schedule's travel-time gaps between two arbitrary jobs.
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
}

async function requestRoute(orsApiKey: string, from: [number, number], to: [number, number]) {
  const orsResponse = await fetch(ORS_DIRECTIONS_URL, {
    method: "POST",
    headers: { Authorization: orsApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: [from, to] }),
    signal: AbortSignal.timeout(8000),
  });
  const ors = (await orsResponse.json()) as OrsDirectionsResponse;
  if (!orsResponse.ok) {
    const message = typeof ors.error === "string" ? ors.error : ors.error?.message;
    throw new Error(message || `Routing service returned ${orsResponse.status}`);
  }
  const route = ors.routes?.[0];
  if (!route) throw new Error("No route found between those points");
  return {
    duration_seconds: Math.round(route.summary.duration),
    distance_meters: Math.round(route.summary.distance),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const orsApiKey = Deno.env.get("ORS_API_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Missing required secrets" }, 500);
  if (!orsApiKey) {
    // Not configured — every caller must treat this as "no ETA available"
    // and fall back to the honest on-track/running-behind comparison.
    return json({ error: "ETA routing isn't configured" }, 501);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Expected a JSON body" }, 400);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  // Scoped to the caller's own JWT — RLS decides what they can actually see.
  // A customer can only resolve a booking of their own; staff can resolve any.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Not signed in" }, 401);

  try {
    if (body.bookingId) {
      const { data: booking, error } = await supabase
        .from("bookings")
        .select("current_lat, current_lng, destination_lat, destination_lng, status")
        .eq("id", body.bookingId)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!booking) return json({ error: "Booking not found or not yours" }, 404);
      if (
        booking.current_lat == null ||
        booking.current_lng == null ||
        booking.destination_lat == null ||
        booking.destination_lng == null
      ) {
        return json({ error: "No live position yet" }, 404);
      }
      const result = await requestRoute(
        orsApiKey,
        [booking.current_lng, booking.current_lat],
        [booking.destination_lng, booking.destination_lat],
      );
      return json({ ...result, computed_at: new Date().toISOString() });
    }

    if (body.fromLat != null && body.fromLng != null && body.toLat != null && body.toLng != null) {
      const { data: isStaff } = await supabase.rpc("is_staff");
      if (!isStaff) return json({ error: "Staff only" }, 403);
      const result = await requestRoute(
        orsApiKey,
        [body.fromLng, body.fromLat],
        [body.toLng, body.toLat],
      );
      return json({ ...result, computed_at: new Date().toISOString() });
    }

    return json({ error: "Provide either bookingId or fromLat/fromLng/toLat/toLng" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 502);
  }
});
