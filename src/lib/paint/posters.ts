/**
 * The pre-rendered frames of the paint surface (see scripts/render-finish-posters.ts).
 * Seven rewards visits and job stages in quarters are the only levels the portal
 * shows, so posters exist for exactly those; anything else uses the nearest.
 */
export const POSTER_LEVELS = [0, 1 / 7, 1 / 4, 2 / 7, 3 / 7, 1 / 2, 4 / 7, 5 / 7, 3 / 4, 6 / 7, 1];

export function posterName(level: number): string {
  let best = POSTER_LEVELS[0]!;
  for (const l of POSTER_LEVELS) if (Math.abs(l - level) < Math.abs(best - level)) best = l;
  return `f${String(Math.round(best * 100)).padStart(2, "0")}`;
}

export const posterSrc = (level: number, size: "wide" | "narrow") =>
  `/finish/${posterName(level)}-${size}.webp`;
