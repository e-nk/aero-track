// MapLibre 6 loads its web worker relative to its own module URL, which breaks
// once the app is bundled. Serve the worker from /public instead (see
// setWorkerUrl in components/map/AircraftMap.tsx). Runs before dev and build so
// the copy always matches the installed version.
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("maplibre-gl/package.json"));
const target = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "maplibre-gl-worker.mjs");
copyFileSync(join(pkgDir, "dist", "maplibre-gl-worker.mjs"), target);
