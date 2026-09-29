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

export interface DrivingRoute {
  seconds: number;
  meters: number;
  /** [lng, lat] pairs, ready for a map line. */
  line: [number, number][];
}

/** The road route itself, for drawing on the map and showing the distance. Null when routing is unavailable. */
export async function fetchDrivingRoute(from: Point, to: Point): Promise<DrivingRoute | null> {
  try {
    const res = await fetch(
      `${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      routes?: {
        duration?: number;
        distance?: number;
        geometry?: { coordinates?: [number, number][] };
      }[];
    };
    const r = body.routes?.[0];
    const line = r?.geometry?.coordinates;
    if (
      typeof r?.duration !== "number" ||
      typeof r.distance !== "number" ||
      !Number.isFinite(r.duration) ||
      !Number.isFinite(r.distance) ||
      !Array.isArray(line) ||
      line.length < 2
    ) {
      return null;
    }
    return { seconds: Math.round(r.duration), meters: Math.round(r.distance), line };
  } catch {
    return null;
  }
}

/** "0.4 mi", "2.6 mi", "12 mi": road distance the way UK drivers read it. */
export function formatMiles(meters: number): string {
  const miles = meters / 1609.344;
  if (miles < 0.1) return "under 0.1 mi";
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}
