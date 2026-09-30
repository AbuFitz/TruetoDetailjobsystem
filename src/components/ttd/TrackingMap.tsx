import { useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin, Radio, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeUpdate } from "@/lib/format";
import { bearingDegrees, distanceMeters, type LatLng as GeoLatLng } from "@/lib/geo";

// See public/maplibre/README-equivalent note in FixNow Mechanics Tracking:
// MapLibre resolves its worker script relative to import.meta.url at
// runtime, which doesn't survive bundling into a route chunk — vendoring
// the worker + its own relative import verbatim under /maplibre/ sidesteps
// it. Re-copy both files from node_modules/maplibre-gl/dist/ on a
// maplibre-gl version bump.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/** No API key, no Google Maps — OpenFreeMap's hosted vector tiles. */
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export interface LatLng {
  lat: number;
  lng: number;
}

interface TrackingMapProps {
  detailerPosition: LatLng | null;
  destination: LatLng | null;
  /** Detailer's profile photo — shown as the marker itself when set, generic figure otherwise. */
  detailerPhotoUrl?: string | null;
  lastUpdate?: string | null;
  /** Road route from the detailer to the address, drawn as a line under the markers. */
  route?: [number, number][] | null;
  className?: string;
}

function directionWedgeSvg(): string {
  return `
    <svg data-role="direction-wedge" viewBox="0 0 44 44" style="opacity:0" class="pointer-events-none absolute inset-0 h-11 w-11 text-signal transition-opacity duration-300">
      <path d="M22 1 L33 24 Q22 18.5 11 24 Z" fill="currentColor" opacity="0.6" />
    </svg>
  `;
}

interface DetailerMarkerElement {
  root: HTMLDivElement;
  wedge: SVGSVGElement | null;
}

function detailerMarkerElement(photoUrl: string | null | undefined): DetailerMarkerElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.className = "relative grid h-11 w-11 place-items-center";
  el.innerHTML = `
    ${directionWedgeSvg()}
    <span class="absolute inset-0 m-auto h-9 w-9 rounded-full bg-signal pulse-ring"></span>
    <span class="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border-2 border-signal bg-ink " data-role="avatar"></span>
  `;
  const wedge = el.querySelector<SVGSVGElement>('[data-role="direction-wedge"]');
  const avatar = el.querySelector<HTMLSpanElement>('[data-role="avatar"]');
  if (avatar) {
    if (photoUrl) {
      const img = document.createElement("img");
      img.src = photoUrl;
      img.alt = "";
      img.className = "h-full w-full object-cover";
      avatar.appendChild(img);
    } else {
      avatar.innerHTML = renderToStaticMarkup(
        <UserRound className="h-4 w-4 text-signal" strokeWidth={2.4} />,
      );
    }
  }
  return { root: el, wedge };
}

const MIN_BEARING_DISTANCE_M = 20;
const MAX_PLAUSIBLE_SPEED_MPS = 65;

interface BearingAnchor {
  position: GeoLatLng;
  atMs: number | null;
}

function destinationMarkerElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.className = "grid h-8 w-8 place-items-center rounded-full border border-black/15 bg-white ";
  el.innerHTML = renderToStaticMarkup(
    <MapPin className="h-4 w-4 text-neutral-900" strokeWidth={2.4} />,
  );
  return el;
}

/**
 * Real map: MapLibre GL JS + OpenFreeMap (no key, no Google Maps). Shows the
 * detailer's live position and the customer's destination, with a custom
 * ink/orange marker and a direction-of-travel wedge. Ported directly from
 * FixNow Mechanics Tracking's TrackingMap.
 */
export function TrackingMap({
  detailerPosition,
  destination,
  detailerPhotoUrl,
  lastUpdate,
  route,
  className,
}: TrackingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const detailerMarkerRef = useRef<Marker | null>(null);
  const detailerWedgeRef = useRef<SVGSVGElement | null>(null);
  const detailerPhotoUrlRef = useRef<string | null | undefined>(undefined);
  const bearingAnchorRef = useRef<BearingAnchor | null>(null);
  const destinationMarkerRef = useRef<Marker | null>(null);
  const hasFitBoundsRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: detailerPosition
        ? [detailerPosition.lng, detailerPosition.lat]
        : destination
          ? [destination.lng, destination.lat]
          : [-0.47, 51.75], // Hemel Hempstead-ish fallback until a real position arrives
      zoom: 12,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    return () => {
      detailerMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      detailerMarkerRef.current = null;
      detailerWedgeRef.current = null;
      detailerPhotoUrlRef.current = undefined;
      bearingAnchorRef.current = null;
      destinationMarkerRef.current = null;
      hasFitBoundsRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (detailerPosition) {
      const lngLat: [number, number] = [detailerPosition.lng, detailerPosition.lat];
      if (!detailerMarkerRef.current) {
        const { root, wedge } = detailerMarkerElement(detailerPhotoUrl);
        detailerMarkerRef.current = new Marker({ element: root, anchor: "center" })
          .setLngLat(lngLat)
          .addTo(map);
        detailerWedgeRef.current = wedge;
        detailerPhotoUrlRef.current = detailerPhotoUrl ?? null;
      } else {
        detailerMarkerRef.current.setLngLat(lngLat);
        if ((detailerPhotoUrl ?? null) !== detailerPhotoUrlRef.current) {
          const avatar = detailerMarkerRef.current
            .getElement()
            .querySelector<HTMLSpanElement>('[data-role="avatar"]');
          if (avatar) {
            avatar.innerHTML = "";
            if (detailerPhotoUrl) {
              const img = document.createElement("img");
              img.src = detailerPhotoUrl;
              img.alt = "";
              img.className = "h-full w-full object-cover";
              avatar.appendChild(img);
            } else {
              avatar.innerHTML = renderToStaticMarkup(
                <UserRound className="h-4 w-4 text-signal" strokeWidth={2.4} />,
              );
            }
          }
          detailerPhotoUrlRef.current = detailerPhotoUrl ?? null;
        }
      }

      const updatedAtMs = lastUpdate ? new Date(lastUpdate).getTime() : null;
      const anchor = bearingAnchorRef.current;
      if (!anchor) {
        bearingAnchorRef.current = { position: detailerPosition, atMs: updatedAtMs };
      } else {
        const moved = distanceMeters(anchor.position, detailerPosition);
        const elapsedS =
          anchor.atMs != null && updatedAtMs != null ? (updatedAtMs - anchor.atMs) / 1000 : null;
        const impliedSpeed = elapsedS && elapsedS > 0 ? moved / elapsedS : null;
        const isPlausibleFix = impliedSpeed == null || impliedSpeed <= MAX_PLAUSIBLE_SPEED_MPS;

        if (moved >= MIN_BEARING_DISTANCE_M && isPlausibleFix) {
          const bearing = bearingDegrees(anchor.position, detailerPosition);
          if (detailerWedgeRef.current) {
            detailerWedgeRef.current.style.transform = `rotate(${bearing}deg)`;
            detailerWedgeRef.current.style.opacity = "1";
          }
          bearingAnchorRef.current = { position: detailerPosition, atMs: updatedAtMs };
        }
      }
    }

    if (destination) {
      const lngLat: [number, number] = [destination.lng, destination.lat];
      if (!destinationMarkerRef.current) {
        destinationMarkerRef.current = new Marker({
          element: destinationMarkerElement(),
          anchor: "bottom",
        })
          .setLngLat(lngLat)
          .addTo(map);
      } else {
        destinationMarkerRef.current.setLngLat(lngLat);
      }
    }

    if (!hasFitBoundsRef.current && detailerPosition && destination) {
      const bounds = new LngLatBounds();
      bounds.extend([detailerPosition.lng, detailerPosition.lat]);
      bounds.extend([destination.lng, destination.lat]);
      map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 0 });
      hasFitBoundsRef.current = true;
    } else if (!hasFitBoundsRef.current && (detailerPosition || destination)) {
      const only = detailerPosition ?? destination!;
      map.setCenter([only.lng, only.lat]);
      map.setZoom(13);
      hasFitBoundsRef.current = true;
    }
  }, [detailerPosition, destination, detailerPhotoUrl, lastUpdate]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const data = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: route ?? [] },
    };
    const apply = () => {
      const source = map.getSource("route") as GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
      } else if (route && route.length > 1) {
        map.addSource("route", { type: "geojson", data });
        map.addLayer({
          id: "route-casing",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#e84a0c", "line-width": 4.5 },
        });
      }
    };
    // The style can still be loading (and "load" may already have fired), so
    // try now and, if the map is not ready, try again on each style update.
    const tryApply = (): boolean => {
      try {
        apply();
        return true;
      } catch {
        return false;
      }
    };
    if (tryApply()) return;
    const retry = () => {
      if (tryApply()) map.off("styledata", retry);
    };
    map.on("styledata", retry);
    return () => {
      map.off("styledata", retry);
    };
  }, [route]);

  return (
    <div
      className={cn("relative overflow-hidden rounded-2xl border border-hairline", className)}
      role="region"
      aria-label="Map showing your detailer's current location and your address"
    >
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-black/10 bg-white/92 px-2.5 py-1.5 backdrop-blur-sm">
        <Radio className="h-3.5 w-3.5 text-signal-deep" strokeWidth={2.4} />
        <span className="eyebrow text-neutral-900">Live</span>
        {lastUpdate ? (
          <span className="text-[10px] font-medium text-neutral-500">
            · {formatRelativeUpdate(lastUpdate)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
