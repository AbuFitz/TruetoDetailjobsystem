import { expect, test } from "bun:test";

// Pretend the device is in California: labels must still show UK time.
process.env.TZ = "America/Los_Angeles";
const { formatAppointment, getEtaStatus } = await import("@/lib/format");

test("appointment labels are UK time whatever the device timezone", () => {
  // 13:00 UTC on 10 Oct is 2pm in the UK (BST) and 6am in California.
  expect(formatAppointment("2026-10-10T13:00:00.000Z")).toEqual({
    dayLabel: "Sat 10 Oct",
    timeLabel: "2:00 PM",
  });
  // 23:30 UTC on 1 Dec is still 1 Dec in the UK (GMT) but 3:30pm the same day in California.
  expect(formatAppointment("2026-12-01T23:30:00.000Z").timeLabel).toBe("11:30 PM");
});

test("ETA wording uses UK clock times", () => {
  const now = Date.parse("2026-10-10T12:30:00.000Z"); // 1:30pm UK
  const status = getEtaStatus(45 * 60, "2026-10-10T13:00:00.000Z", now);
  expect(status.label).toContain("Arriving around 2:15 PM");
  expect(status.label).toContain("your 2:00 PM slot");
});
