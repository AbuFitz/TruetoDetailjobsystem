/**
 * What the rewards card knows: how many completed visits a customer has, and
 * whether that changed since this device last looked. Nothing here decides
 * what a reward is or how it is claimed; it only reports real visits.
 */

const KEY_PREFIX = "ttd_rewards_seen:";

export interface RewardsView {
  earned: number;
  required: number;
  remaining: number;
  reached: boolean;
  /** Fraction of the way there, 0 to 1. */
  fraction: number;
}

export function rewardsView(completedVisits: number, required: number): RewardsView {
  const earned = Math.min(completedVisits, required);
  return {
    earned,
    required,
    remaining: Math.max(0, required - completedVisits),
    reached: completedVisits >= required,
    fraction: required > 0 ? earned / required : 0,
  };
}

export interface Celebration {
  /** Stamp numbers (1 based) that are new since the last look on this device. */
  newStamps: number[];
  /** The last look was short of the goal and this one has reached it. */
  milestone: boolean;
}

/**
 * Compares this look with the last one on this device. Returns null on the
 * very first look (nothing to celebrate yet) and when nothing has changed.
 */
export function celebrationFor(
  lastSeen: number | null,
  completedVisits: number,
  required: number,
): Celebration | null {
  if (lastSeen === null || completedVisits <= lastSeen) return null;
  const newStamps: number[] = [];
  for (let n = lastSeen + 1; n <= Math.min(completedVisits, required); n++) newStamps.push(n);
  if (newStamps.length === 0) return null;
  return { newStamps, milestone: lastSeen < required && completedVisits >= required };
}

export function readLastSeen(key: string): number | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeLastSeen(key: string, visits: number): void {
  try {
    localStorage.setItem(KEY_PREFIX + key, String(visits));
  } catch {
    /* storage can be blocked; the card simply will not remember */
  }
}
