export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points, in metres (haversine). */
export function distanceMeters(from: LatLng, to: LatLng): number {
  const phi1 = toRadians(from.lat);
  const phi2 = toRadians(to.lat);
  const dPhi = toRadians(to.lat - from.lat);
  const dLambda = toRadians(to.lng - from.lng);

  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Initial compass bearing from one point to another, in degrees clockwise
 * from true north (0-360). This is "direction of travel" between two GPS
 * fixes — not device compass heading, which needs a magnetometer reading
 * most phones don't reliably report while mounted in a car.
 */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const phi1 = toRadians(from.lat);
  const phi2 = toRadians(to.lat);
  const dLambda = toRadians(to.lng - from.lng);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}
