import { describe, expect, test } from "bun:test";
import {
  firstAvailableSlot,
  formatBookingDate,
  isSlotAvailable,
  slotMinutes,
  ukNow,
  ukSlotToIso,
} from "@/lib/slots";

describe("slot rules", () => {
  test("reads slot labels", () => {
    expect(slotMinutes("8:00 AM")).toBe(480);
    expect(slotMinutes("12:00 PM")).toBe(720);
    expect(slotMinutes("6:00 PM")).toBe(1080);
    expect(Number.isNaN(slotMinutes("noonish"))).toBe(true);
  });

  test("uses UK time in summer (BST)", () => {
    // 09:30 UTC is 10:30 in the UK in July.
    const now = new Date("2026-07-15T09:30:00Z");
    expect(ukNow(now)).toEqual({ date: "2026-07-15", minutes: 630 });
    expect(isSlotAvailable("2026-07-15", "10:00 AM", now)).toBe(false);
    expect(isSlotAvailable("2026-07-15", "12:00 PM", now)).toBe(true);
    expect(firstAvailableSlot("2026-07-15", now)).toBe("12:00 PM");
  });

  test("needs an hour of notice on the day", () => {
    // 10:30 GMT in December: 12:00 is 90 min away (ok), 11:00 would not be.
    const now = new Date("2026-12-01T10:30:00Z");
    expect(isSlotAvailable("2026-12-01", "12:00 PM", now)).toBe(true);
    const late = new Date("2026-12-01T11:15:00Z");
    expect(isSlotAvailable("2026-12-01", "12:00 PM", late)).toBe(false);
  });

  test("full day and past days", () => {
    const evening = new Date("2026-12-01T18:00:00Z");
    expect(firstAvailableSlot("2026-12-01", evening)).toBeNull();
    expect(firstAvailableSlot("2026-12-02", evening)).toBe("8:00 AM");
    expect(isSlotAvailable("2026-11-30", "4:00 PM", evening)).toBe(false);
    expect(isSlotAvailable("not-a-date", "4:00 PM", evening)).toBe(false);
  });

  test("UK midnight rolls the date before UTC does", () => {
    // 23:30 UTC on 5 Oct is 00:30 on 6 Oct in the UK.
    expect(ukNow(new Date("2026-10-05T23:30:00Z")).date).toBe("2026-10-06");
  });
});

describe("ukSlotToIso", () => {
  test("summer slots are an hour behind in UTC", () => {
    expect(ukSlotToIso("2026-07-15", "2:00 PM")).toBe("2026-07-15T13:00:00.000Z");
  });

  test("winter slots match UTC", () => {
    expect(ukSlotToIso("2026-12-01", "8:00 AM")).toBe("2026-12-01T08:00:00.000Z");
  });

  test("clock change weekends", () => {
    // Clocks go back 25 Oct 2026, forward 28 Mar 2027.
    expect(ukSlotToIso("2026-10-24", "10:00 AM")).toBe("2026-10-24T09:00:00.000Z");
    expect(ukSlotToIso("2026-10-25", "10:00 AM")).toBe("2026-10-25T10:00:00.000Z");
    expect(ukSlotToIso("2027-03-28", "10:00 AM")).toBe("2027-03-28T09:00:00.000Z");
  });
});

test("dates read naturally", () => {
  expect(formatBookingDate("2026-10-10")).toBe("Saturday 10 October 2026");
  expect(formatBookingDate("bad")).toBe("bad");
});
