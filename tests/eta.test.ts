import { afterEach, expect, test } from "bun:test";
import { fetchDrivingEtaSeconds } from "@/lib/eta";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const A = { lat: 51.74, lng: -0.46 };
const B = { lat: 51.75, lng: -0.47 };

test("uses the routing duration, rounded to whole seconds", async () => {
  globalThis.fetch = (async (url: string) => {
    expect(String(url)).toContain("-0.46,51.74;-0.47,51.75");
    return new Response(JSON.stringify({ routes: [{ duration: 779.6 }] }));
  }) as unknown as typeof fetch;
  expect(await fetchDrivingEtaSeconds(A, B)).toBe(780);
});

test("gives no ETA, never a guess, when routing fails or answers nonsense", async () => {
  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
  expect(await fetchDrivingEtaSeconds(A, B)).toBeNull();
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ routes: [] }))) as unknown as typeof fetch;
  expect(await fetchDrivingEtaSeconds(A, B)).toBeNull();
  globalThis.fetch = (async () => {
    throw new TypeError("offline");
  }) as unknown as typeof fetch;
  expect(await fetchDrivingEtaSeconds(A, B)).toBeNull();
});
