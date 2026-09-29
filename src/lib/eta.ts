/**
 * Driving time from the detailer's phone to the customer's address, from the
 * public OSRM routing service (no key). Returns null when routing is not
 * available, so the customer sees "on the way" rather than an invented time.
 */
const OSRM = "https://router.project-osrm.org/route/v1/driving";

export interface Point {
  lat: number;
  lng: number;
}

export async function fetchDrivingEtaSeconds(from: Point, to: Point): Promise<number | null> {
  try {
    const res = await fetch(`${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { routes?: { duration?: number }[] };
    const seconds = body.routes?.[0]?.duration;
    return typeof seconds === "number" && Number.isFinite(seconds) ? Math.round(seconds) : null;
  } catch {
    return null;
  }
}
