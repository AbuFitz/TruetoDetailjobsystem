/**
 * UK postcode → coordinates, via the free Postcodes.io API (no API key).
 * Used only at session-creation time, to plot the destination marker on the
 * customer's tracking map — not for geofencing or automatic arrival.
 */

export class PostcodeLookupError extends Error {}

/** "hp27de" -> "HP2 7DE". Best-effort; the API is the real validator. */
export function normalisePostcode(raw: string): string {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (compact.length < 5 || compact.length > 7) return compact;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export interface GeocodedPostcode {
  postcode: string;
  lat: number;
  lng: number;
}

export async function geocodePostcode(rawPostcode: string): Promise<GeocodedPostcode> {
  const postcode = normalisePostcode(rawPostcode);
  if (!postcode) {
    throw new PostcodeLookupError("Enter a postcode.");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ""))}`,
    );
  } catch {
    throw new PostcodeLookupError(
      "Couldn't reach the postcode lookup service. Check your connection and try again.",
    );
  }

  if (response.status === 404) {
    throw new PostcodeLookupError(`"${postcode}" doesn't look like a valid UK postcode.`);
  }
  if (!response.ok) {
    throw new PostcodeLookupError("Postcode lookup failed. Try again in a moment.");
  }

  const body = (await response.json()) as {
    result?: { latitude: number; longitude: number } | null;
  };
  if (!body.result) {
    throw new PostcodeLookupError(`"${postcode}" doesn't look like a valid UK postcode.`);
  }

  return { postcode, lat: body.result.latitude, lng: body.result.longitude };
}
