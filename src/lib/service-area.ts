/**
 * Mobile service-area eligibility. True To Detail covers Hemel Hempstead and
 * the surrounding Hertfordshire/Bucks/Beds towns described on the marketing
 * site (truetodetail.co.uk) — which, by postcode "area" (the letters before
 * the first digit), collapses to four outward-code areas: HP (Hemel
 * Hempstead, Berkhamsted, Tring, Chesham, Amersham, Beaconsfield, High
 * Wycombe), WD (Watford, Rickmansworth, Bushey, Kings Langley, Abbots
 * Langley, Radlett, Borehamwood), AL (St Albans, Harpenden, Hatfield, Welwyn
 * Garden City) and LU (Luton, Dunstable).
 *
 * This is the client-side source of truth for the booking flow's "we cover
 * your area" gate. The same list is mirrored server-side in the
 * `service_areas` table / `is_postcode_covered()` — see
 * supabase/migrations — as a defense-in-depth check on booking creation, so
 * a customer can't bypass the client-side gate by posting directly.
 */
import { geocodePostcode, normalisePostcode, type GeocodedPostcode } from "./postcode";

export const COVERED_POSTCODE_AREAS = ["HP", "WD", "AL", "LU"] as const;

/** "HP2 6EL" -> "HP". Letters only, before the first digit. */
export function postcodeArea(postcode: string): string {
  const compact = normalisePostcode(postcode).replace(/\s+/g, "");
  const match = /^[A-Z]+/.exec(compact);
  return match ? match[0] : "";
}

export function isAreaCovered(postcode: string): boolean {
  return (COVERED_POSTCODE_AREAS as readonly string[]).includes(postcodeArea(postcode));
}

export interface ServiceAreaResult extends GeocodedPostcode {
  covered: boolean;
}

/** Geocodes a postcode and checks it against the covered service area in one call. */
export async function checkServiceArea(rawPostcode: string): Promise<ServiceAreaResult> {
  const geocoded = await geocodePostcode(rawPostcode);
  return { ...geocoded, covered: isAreaCovered(geocoded.postcode) };
}
