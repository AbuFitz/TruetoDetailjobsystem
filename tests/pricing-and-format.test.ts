import { describe, expect, test } from "bun:test";
import { DETAIL_ADDONS, DETAIL_PACKAGES } from "@/lib/constants";
import { getEtaStatus, getScheduleStatus, ordinal } from "@/lib/format";

describe("prices match the main website", () => {
  // Same table as truetodetail.co.uk's lib/pricing.ts. If one site's prices
  // change, this fails until the other is updated to match.
  test("packages", () => {
    const table = Object.fromEntries(DETAIL_PACKAGES.map((p) => [p.id, p.priceBySize]));
    expect(table).toEqual({
      essential: { small: 80, midsize: 90, largesuv: 105 },
      "full-valet": { small: 140, midsize: 155, largesuv: 175 },
      "premium-detail": { small: 220, midsize: 240, largesuv: 270 },
    });
  });

  test("add-ons", () => {
    expect(Object.fromEntries(DETAIL_ADDONS.map((a) => [a.id, a.price]))).toEqual({
      "engine-bay": 40,
      "pet-hair": 25,
      odour: 30,
      "seat-shampoo": 30,
      steam: 35,
    });
  });
});

describe("arrival and schedule status", () => {
  const now = new Date("2026-10-06T09:00:00Z").getTime();
  const appt = "2026-10-06T09:30:00Z";

  test("an ETA before the slot is on track", () => {
    expect(getEtaStatus(20 * 60, appt, now).tone).toBe("on-track");
  });

  test("an ETA well after the slot says so", () => {
    const s = getEtaStatus(75 * 60, appt, now);
    expect(s.tone).toBe("behind");
    expect(s.label).toContain("well behind");
  });

  test("schedule status escalates only after the grace window", () => {
    const at = (min: number) => new Date(appt).getTime() + min * 60 * 1000;
    expect(getScheduleStatus(appt, "9:30 AM", at(5)).tone).toBe("on-track");
    expect(getScheduleStatus(appt, "9:30 AM", at(20)).label).toBe("Running a little behind schedule");
    expect(getScheduleStatus(appt, "9:30 AM", at(60)).label).toBe(
      "Running well behind schedule. Thanks for your patience.",
    );
  });

  test("customer-facing status copy has no em dashes", () => {
    const at = (min: number) => new Date(appt).getTime() + min * 60 * 1000;
    for (const min of [0, 20, 60]) {
      expect(getScheduleStatus(appt, "9:30 AM", at(min)).label).not.toContain("—");
    }
  });

  test("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd",
    ]);
  });
});
