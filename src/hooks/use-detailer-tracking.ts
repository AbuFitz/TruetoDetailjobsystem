import { useEffect, useRef, useState } from "react";
import {
  geolocationErrorMessage,
  GEOLOCATION_OPTIONS,
  LOCATION_WRITE_THROTTLE_MS,
} from "@/lib/geolocation";

export interface Coords {
  lat: number;
  lng: number;
}

interface UseDetailerTrackingOptions {
  /** Called once with the first fix when "Start journey" is pressed. */
  onStart: (position: Coords) => Promise<void>;
  /** Called for both throttled watch-position ticks and "Resume sharing". */
  onUpdate: (position: Coords) => Promise<void>;
}

/**
 * Requests a screen wake lock so the phone doesn't sleep mid-journey.
 * Missing API support or a user/OS denial both fail silently — best-effort
 * nicety, never something to surface as an error. Ported from FixNow
 * Mechanics Tracking's use-technician-tracking.ts (same GPS orchestration,
 * just "detailer" instead of "technician").
 */
async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if (!("wakeLock" in navigator)) return null;
  try {
    return await navigator.wakeLock.request("screen");
  } catch {
    return null;
  }
}

/**
 * Browser Geolocation orchestration for the detailer's job screen: acquires
 * a fix, starts a throttled watch, and exposes just enough state to render a
 * live-sharing indicator. Knows nothing about Supabase — the caller owns
 * persistence (via detailerStartJourney/detailerUpdateLocation) and any
 * follow-up refetch inside onStart/onUpdate.
 */
export function useDetailerTracking({ onStart, onUpdate }: UseDetailerTrackingOptions) {
  const [isWatching, setIsWatching] = useState(false);
  const [starting, setStarting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [lastLocalFix, setLastLocalFix] = useState<number | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastWriteRef = useRef(0);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const isWatchingRef = useRef(false);

  useEffect(
    () => () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      wakeLockRef.current?.release().catch(() => {});
    },
    [],
  );

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible" || !isWatchingRef.current) return;
      requestWakeLock().then((lock) => {
        wakeLockRef.current = lock;
      });
      if (!("geolocation" in navigator)) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoError(null);
          setLastLocalFix(Date.now());
          lastWriteRef.current = Date.now();
          onUpdateRef
            .current({ lat: pos.coords.latitude, lng: pos.coords.longitude })
            .catch(() => {});
        },
        () => {},
        GEOLOCATION_OPTIONS,
      );
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  function beginWatching() {
    if (watchIdRef.current !== null || !("geolocation" in navigator)) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        setLastLocalFix(Date.now());
        const elapsed = Date.now() - lastWriteRef.current;
        if (elapsed >= LOCATION_WRITE_THROTTLE_MS) {
          lastWriteRef.current = Date.now();
          onUpdateRef
            .current({ lat: pos.coords.latitude, lng: pos.coords.longitude })
            .catch(() => {});
        }
      },
      (err) => setGeoError(geolocationErrorMessage(err)),
      GEOLOCATION_OPTIONS,
    );
    isWatchingRef.current = true;
    setIsWatching(true);
    requestWakeLock().then((lock) => {
      wakeLockRef.current = lock;
    });
  }

  function endWatching() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    isWatchingRef.current = false;
    setIsWatching(false);
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }

  function startJourney() {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("This browser doesn't support location sharing.");
      return;
    }
    setStarting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await onStart({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          lastWriteRef.current = Date.now();
          setLastLocalFix(Date.now());
          beginWatching();
        } catch (err) {
          setGeoError(err instanceof Error ? err.message : "Couldn't start the journey.");
        } finally {
          setStarting(false);
        }
      },
      (err) => {
        setStarting(false);
        setGeoError(geolocationErrorMessage(err));
      },
      GEOLOCATION_OPTIONS,
    );
  }

  function resumeSharing() {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("This browser doesn't support location sharing.");
      return;
    }
    setResuming(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await onUpdateRef.current({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          lastWriteRef.current = Date.now();
          setLastLocalFix(Date.now());
          beginWatching();
        } catch (err) {
          setGeoError(err instanceof Error ? err.message : "Couldn't resume location sharing.");
        } finally {
          setResuming(false);
        }
      },
      (err) => {
        setResuming(false);
        setGeoError(geolocationErrorMessage(err));
      },
      GEOLOCATION_OPTIONS,
    );
  }

  return {
    isWatching,
    starting,
    resuming,
    geoError,
    lastLocalFix,
    startJourney,
    resumeSharing,
    endWatching,
  };
}
