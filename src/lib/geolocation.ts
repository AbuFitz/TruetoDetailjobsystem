export function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission was denied. Allow location access for this site in your browser settings, then try again.";
    case err.POSITION_UNAVAILABLE:
      return "Your location couldn't be determined. Try again in a moment.";
    case err.TIMEOUT:
      return "Location request timed out. Try again.";
    default:
      return "Couldn't get your location.";
  }
}

export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  // Never reuse a cached fix — always force a fresh GPS read. A live
  // tracking link is only as accurate as its most recent write, and a
  // stale-but-"fresh enough" cached position undermines that silently.
  maximumAge: 0,
  timeout: 15_000,
};

/** DB writes are throttled to roughly this often, no matter how fast GPS fires. */
export const LOCATION_WRITE_THROTTLE_MS = 5_000;
