import { afterEach, expect, test } from "bun:test";
import {
  checklistProgress,
  estimatedFinish,
  journeyEvents,
  timeOnSiteMinutes,
} from "@/lib/journey";
import { buildIcs, googleCalendarUrl } from "@/lib/calendar";
import { fetchDrivingRoute, formatMiles } from "@/lib/eta";
import { passwordChangeMessage } from "@/lib/auth";
import { statusAlert } from "@/lib/alerts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const base = {
  status: "in_progress" as const,
  created_at: "2026-10-01T09:00:00Z",
  en_route_at: "2026-10-05T08:30:00Z",
  arrived_at: "2026-10-05T09:00:00Z",
  in_progress_at: "2026-10-05T09:05:00Z",
  completed_at: null,
  cancelled_at: null,
  estimated_duration_minutes: 120,
};

test("the journey lists every step in order, with times only for what has happened", () => {
  const e = journeyEvents(base, "Jamie");
  expect(e.map((x) => x.key)).toEqual(["booked", "on_the_way", "arrived", "detailing", "done"]);
  expect(e[1]!.label).toBe("Jamie set off");
  expect(e[4]!.at).toBeNull();
  const c = journeyEvents({ ...base, status: "cancelled", cancelled_at: "2026-10-02T10:00:00Z" });
  expect(c.map((x) => x.key)).toEqual(["booked", "cancelled"]);
});

test("the finish estimate is the start plus the booked time, and only while detailing", () => {
  expect(estimatedFinish(base)?.toISOString()).toBe("2026-10-05T11:05:00.000Z");
  expect(estimatedFinish({ ...base, in_progress_at: null })?.toISOString()).toBe(
    "2026-10-05T11:00:00.000Z",
  );
  expect(estimatedFinish({ ...base, status: "en_route" })).toBeNull();
  expect(estimatedFinish({ ...base, status: "completed" })).toBeNull();
});

test("checklist progress counts ticks in display order and names the next step", () => {
  const p = checklistProgress([
    { key: "final_check", done: false },
    { key: "exterior", done: true },
    { key: "interior", done: false },
    { key: "protection", done: false },
  ]);
  expect(p).toMatchObject({ done: 1, total: 4, percent: 25, current: "Interior clean" });
  expect(checklistProgress([]).percent).toBe(0);
  expect(
    timeOnSiteMinutes({ arrived_at: base.arrived_at, completed_at: "2026-10-05T11:30:00Z" }),
  ).toBe(150);
  expect(timeOnSiteMinutes({ arrived_at: null, completed_at: "2026-10-05T11:30:00Z" })).toBeNull();
});

test("the calendar file is valid, escaped and has a reminder", () => {
  const ics = buildIcs({
    uid: "TTD-1",
    title: "True To Detail: Full Valet, Small Car",
    start: new Date("2026-10-05T09:00:00Z"),
    durationMinutes: 90,
    location: "Hemel Hempstead, HP2 6EL",
  });
  expect(ics).toContain("DTSTART:20261005T090000Z");
  expect(ics).toContain("DTEND:20261005T103000Z");
  expect(ics).toContain("SUMMARY:True To Detail: Full Valet\\, Small Car");
  expect(ics).toContain("BEGIN:VALARM");
  expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  expect(
    googleCalendarUrl({
      uid: "x",
      title: "T",
      start: new Date("2026-10-05T09:00:00Z"),
      durationMinutes: 60,
    }),
  ).toContain("dates=20261005T090000Z%2F20261005T100000Z");
});

test("the route comes from real roads or not at all", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        routes: [
          {
            duration: 601.2,
            distance: 4023,
            geometry: {
              coordinates: [
                [-0.46, 51.74],
                [-0.47, 51.75],
              ],
            },
          },
        ],
      }),
    )) as unknown as typeof fetch;
  const r = await fetchDrivingRoute({ lat: 51.74, lng: -0.46 }, { lat: 51.75, lng: -0.47 });
  expect(r).toMatchObject({ seconds: 601, meters: 4023 });
  expect(r?.line).toHaveLength(2);
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ routes: [{ duration: 5 }] }))) as unknown as typeof fetch;
  expect(await fetchDrivingRoute({ lat: 1, lng: 1 }, { lat: 2, lng: 2 })).toBeNull();
  expect(formatMiles(4023)).toBe("2.5 mi");
  expect(formatMiles(30000)).toBe("19 mi");
});

test("alerts speak for the moments that matter and stay quiet otherwise", () => {
  expect(statusAlert("en_route", "Jamie")?.title).toBe("Jamie is on the way");
  expect(statusAlert("arrived")?.title).toBe("Your detailer has arrived");
  expect(statusAlert("in_progress")).toBeNull();
});

test("password change errors read as plain English", () => {
  expect(passwordChangeMessage({ code: "same_password" })).toMatch(/not used before/);
  expect(
    passwordChangeMessage({ message: "Password is known to be weak and easy to guess" }),
  ).toMatch(/too easy/);
  expect(passwordChangeMessage({ message: "Password update requires reauthentication" })).toMatch(
    /sign in again/,
  );
});
