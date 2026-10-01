import { expect, test } from "bun:test";
import {
  CUSTOMER_STEPS,
  customerHeadline,
  customerStepIndex,
  formatDuration,
} from "@/lib/progress";
import type { BookingStatus } from "@/lib/bookings";
import { VEHICLE_SIZE_GUIDE, VEHICLE_SIZE_LABELS } from "@/lib/constants";

const ALL: BookingStatus[] = [
  "requested",
  "confirmed",
  "assigned",
  "en_route",
  "arrived",
  "check_in",
  "in_progress",
  "qc",
  "handover",
  "completed",
  "cancelled",
];

test("customers see five steps", () => {
  expect(CUSTOMER_STEPS.length).toBe(5);
});

test("every status maps to a step and never goes backwards through a job", () => {
  const order: BookingStatus[] = [
    "confirmed",
    "assigned",
    "en_route",
    "arrived",
    "in_progress",
    "handover",
    "completed",
  ];
  let last = -2;
  for (const s of order) {
    const i = customerStepIndex(s);
    expect(i).toBeGreaterThanOrEqual(last);
    last = i;
  }
  for (const s of ALL) expect(typeof customerStepIndex(s)).toBe("number");
  expect(customerStepIndex("cancelled")).toBe(-1);
  expect(customerStepIndex("check_in")).toBe(customerStepIndex("in_progress"));
});

test("headlines read in plain English, with the detailer's name when known", () => {
  expect(customerHeadline("en_route", "Jamie")).toBe("Jamie is on the way");
  expect(customerHeadline("en_route")).toBe("Your detailer is on the way");
  for (const s of ALL) {
    const h = customerHeadline(s);
    expect(h.length).toBeGreaterThan(5);
    expect(h).not.toMatch(/—|--/);
  }
});

test("durations", () => {
  expect(formatDuration(20)).toBe("1 min");
  expect(formatDuration(12 * 60)).toBe("12 min");
  expect(formatDuration(65 * 60)).toBe("1 hr 5 min");
  expect(formatDuration(2 * 3600)).toBe("2 hr");
});

test("the size guide uses UK words and matches the rule: hatchbacks and coupes small, saloons and estates mid-size", () => {
  const all = JSON.stringify(VEHICLE_SIZE_GUIDE);
  expect(all).not.toMatch(/sedan|wagon|minivan/i);
  expect(VEHICLE_SIZE_GUIDE.small.body).toBe("Hatchbacks, coupes and small crossovers");
  expect(VEHICLE_SIZE_GUIDE.midsize.body).toBe("Saloons, estates and compact SUVs");
  expect(VEHICLE_SIZE_GUIDE.largesuv.body).toMatch(/Large SUVs, 4x4s and people carriers/);
  expect(Object.keys(VEHICLE_SIZE_GUIDE)).toEqual(Object.keys(VEHICLE_SIZE_LABELS));
});
