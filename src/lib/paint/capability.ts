/**
 * Decides whether this device gets the live paint surface or the poster, and
 * how heavy it may be. The live layer is an enhancement: anything doubtful gets
 * the poster, which is a designed frame from the same shader, not a blank.
 */
export interface StagePlan {
  /** Live WebGL, or the poster. */
  live: boolean;
  /** Cheaper shader and lower resolution ceiling. */
  lite: boolean;
  maxDpr: number;
  /** Why it is a poster, for diagnostics. */
  reason?: string;
}

let webglOk: boolean | null = null;
function hasWebGL(): boolean {
  if (webglOk !== null) return webglOk;
  try {
    const c = document.createElement("canvas");
    webglOk = Boolean(c.getContext("webgl"));
  } catch {
    webglOk = false;
  }
  return webglOk;
}

interface NavigatorHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/** Override for diagnostics and tests: ?stage=poster or ?stage=live (or localStorage ttd-stage). */
function override(): "poster" | "live" | null {
  try {
    const q = new URLSearchParams(window.location.search).get("stage");
    const v = q ?? window.localStorage.getItem("ttd-stage");
    return v === "poster" || v === "live" ? v : null;
  } catch {
    return null;
  }
}

export function planStage(reducedMotion: boolean): StagePlan {
  const nav = navigator as Navigator & NavigatorHints;
  const small = window.innerWidth < 768;
  const lite = small || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4);
  const base = { lite, maxDpr: lite ? 1.5 : 1.75 };
  const forced = override();
  if (forced === "poster") return { ...base, live: false, reason: "override" };
  if (forced === "live" && hasWebGL()) return { ...base, live: true };
  if (reducedMotion) return { ...base, live: false, reason: "reduced-motion" };
  if (nav.connection?.saveData) return { ...base, live: false, reason: "save-data" };
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 1)
    return { ...base, live: false, reason: "low-memory" };
  if (!hasWebGL()) return { ...base, live: false, reason: "no-webgl" };
  return { ...base, live: true };
}
