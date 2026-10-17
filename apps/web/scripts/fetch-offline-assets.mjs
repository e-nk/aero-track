// Downloads everything the offline demo needs into public/offline/ (SPEC 5.3, 13):
//   sydney.pmtiles  - Protomaps basemap extract around the live coverage area
//   fonts/, sprites/ - map glyphs and icons from protomaps/basemaps-assets
// Usage: pnpm --filter web offline:assets [-- --build YYYYMMDD]
// Needs the pmtiles CLI (https://github.com/protomaps/go-pmtiles/releases) on PATH, or PMTILES_BIN.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "offline");
// The 60 nm live coverage circle around Sydney (THRESHOLDS.poll) plus a margin. ~27 MB at zoom 13.
const BBOX = "149.7,-35.0,152.3,-32.8";
const MAX_ZOOM = 13;
// Pinned so the offline style never changes underneath us.
const ASSETS_COMMIT = "028c18f713baecad011301ff7a69acc39bcc2ae7";
const FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic", "Noto Sans Devanagari Regular v1"];

const pmtiles = process.env.PMTILES_BIN ?? "pmtiles";
try {
  execFileSync(pmtiles, ["version"], { stdio: "ignore" });
} catch {
  console.error(
    `Can't run "${pmtiles}". Install the pmtiles CLI from https://github.com/protomaps/go-pmtiles/releases ` +
      "and put it on PATH, or set PMTILES_BIN=/path/to/pmtiles.",
  );
  process.exit(1);
}

/** Protomaps keeps daily builds for about a week; find the newest one. */
async function latestBuild() {
  for (let back = 0; back < 10; back++) {
    const d = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
    const res = await fetch(`https://build.protomaps.com/${d}.pmtiles`, { method: "HEAD" });
    if (res.ok) return d;
  }
  throw new Error("No Protomaps build found in the last 10 days; see https://maps.protomaps.com/builds");
}

const args = process.argv.slice(2).filter((a) => a !== "--");
const i = args.indexOf("--build");
const build = i >= 0 && args[i + 1] ? args[i + 1] : await latestBuild();
mkdirSync(OUT, { recursive: true });

console.log(`Extracting Sydney tiles from Protomaps build ${build}…`);
execFileSync(
  pmtiles,
  ["extract", `https://build.protomaps.com/${build}.pmtiles`, join(OUT, "sydney.pmtiles"), `--bbox=${BBOX}`, `--maxzoom=${MAX_ZOOM}`],
  { stdio: "inherit" },
);

console.log("Downloading fonts and sprites…");
const tmp = mkdtempSync(join(tmpdir(), "basemaps-assets-"));
try {
  const res = await fetch(`https://codeload.github.com/protomaps/basemaps-assets/tar.gz/${ASSETS_COMMIT}`);
  if (!res.ok) throw new Error(`basemaps-assets download failed: ${res.status}`);
  const tarball = join(tmp, "assets.tgz");
  writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  execFileSync("tar", ["-xzf", tarball, "-C", tmp, "--strip-components=1"]);
  for (const font of FONTS) cpSync(join(tmp, "fonts", font), join(OUT, "fonts", font), { recursive: true });
  cpSync(join(tmp, "fonts", "OFL.txt"), join(OUT, "fonts", "OFL.txt"));
  mkdirSync(join(OUT, "sprites", "v4"), { recursive: true });
  for (const f of ["dark.json", "dark.png", "dark@2x.json", "dark@2x.png"]) cpSync(join(tmp, "sprites", "v4", f), join(OUT, "sprites", "v4", f));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const mb = (p) => (existsSync(p) ? (statSync(p).size / 1e6).toFixed(1) : "?");
console.log(`Done: public/offline/sydney.pmtiles (${mb(join(OUT, "sydney.pmtiles"))} MB), fonts and sprites.`);
