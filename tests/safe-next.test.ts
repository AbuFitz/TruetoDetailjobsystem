import { describe, expect, test } from "bun:test";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  test("keeps paths on this site", () => {
    expect(safeNext("/account/vehicles")).toBe("/account/vehicles");
    expect(safeNext("/book")).toBe("/book");
  });

  test("drops anything that would leave the site", () => {
    expect(safeNext("https://example.com/phish")).toBeUndefined();
    expect(safeNext("//example.com/phish")).toBeUndefined();
    expect(safeNext("/\\example.com/phish")).toBeUndefined();
    expect(safeNext("javascript:alert(1)")).toBeUndefined();
  });

  test("drops empty values", () => {
    expect(safeNext(undefined)).toBeUndefined();
    expect(safeNext("")).toBeUndefined();
  });
});
