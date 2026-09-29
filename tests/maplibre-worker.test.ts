import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The map's worker is served from public/maplibre. A version mismatch with
// the bundled maplibre-gl leaves the live tracking map blank.
test("vendored MapLibre worker matches the installed maplibre-gl", () => {
  const root = join(import.meta.dir, "..");
  for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    const vendored = readFileSync(join(root, "public/maplibre", file));
    const installed = readFileSync(join(root, "node_modules/maplibre-gl/dist", file));
    expect(vendored.equals(installed), `${file} is out of date`).toBe(true);
  }
});
