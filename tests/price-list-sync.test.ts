import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DETAIL_ADDONS, DETAIL_PACKAGES } from "@/lib/constants";

// The database recomputes customer booking prices from its own copy of the
// price list (see the customer_booking_guard migration). If the two drift,
// the price a customer is shown stops matching what gets saved.
const dir = join(import.meta.dir, "..", "supabase", "migrations");
const latest = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .filter((sql) => sql.includes("function public.detail_package_list"))
  .at(-1)!;

function valuesOf(fn: string): string[][] {
  const body = latest.slice(latest.indexOf(`function public.${fn}`));
  const block = body.slice(body.indexOf("values"), body.indexOf("$$", body.indexOf("values")));
  // One row per line: quoted text or bare numbers, commas between.
  return block
    .split("\n")
    .filter((line) => line.trim().startsWith("("))
    .map((line) => [...line.matchAll(/'([^']*)'|(\d+(?:\.\d+)?)/g)].map((m) => m[1] ?? m[2]!));
}

test("database package prices match the app", () => {
  const rows = valuesOf("detail_package_list");
  expect(rows.map((r) => r[0])).toEqual(DETAIL_PACKAGES.map((p) => p.id));
  for (const p of DETAIL_PACKAGES) {
    const row = rows.find((r) => r[0] === p.id)!;
    expect(row).toEqual([
      p.id,
      p.name,
      String(p.durationMinutes),
      String(p.priceBySize.small),
      String(p.priceBySize.midsize),
      String(p.priceBySize.largesuv),
    ]);
  }
});

test("database add-on prices match the app", () => {
  const rows = valuesOf("detail_addon_list");
  expect(rows).toEqual(DETAIL_ADDONS.map((a) => [a.id, a.label, String(a.price)]));
});
