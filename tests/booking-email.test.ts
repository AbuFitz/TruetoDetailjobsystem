import { expect, test } from "bun:test";
import { confirmationNotice } from "@/lib/booking-email";

test("nothing is said until the email outcome is known", () => {
  expect(confirmationNotice(null, "sam@example.com")).toBeNull();
});

test("a sent confirmation says where it went", () => {
  expect(confirmationNotice({ sent: true, staffNotified: true }, "sam@example.com")).toEqual({
    tone: "ok",
    text: "Confirmation emailed to sam@example.com",
  });
});

test("a failed confirmation says so, and only claims the team knows if the team was really told", () => {
  const told = confirmationNotice({ sent: false, staffNotified: true }, "sam@example.com")!;
  expect(told.tone).toBe("warn");
  expect(told.text).toContain("could not send your confirmation email");
  expect(told.text).toContain("We have been told about it.");
  expect(told.text).not.toContain("call or WhatsApp");

  for (const o of [{ sent: false }, { sent: false, staffNotified: false }]) {
    const unsure = confirmationNotice(o, "sam@example.com")!;
    expect(unsure.tone).toBe("warn");
    expect(unsure.text).not.toContain("We have been told");
    expect(unsure.text).toContain("call or WhatsApp");
  }
});
