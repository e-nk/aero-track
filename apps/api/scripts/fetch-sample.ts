// One real adsb.lol request through client → schema → adapter, logged.
// Usage: ADSB_USER_AGENT="AeroTrack/0.1 (+you@example.com)" pnpm --filter api fetch:sample
import { THRESHOLDS } from "@aerotrack/shared";
import { adaptResponse } from "../src/providers/adsblol/adapter";
import { createAdsbLolClient } from "../src/providers/adsblol/client";

const userAgent = process.env.ADSB_USER_AGENT;
if (!userAgent) {
  console.error("Set ADSB_USER_AGENT first.");
  process.exit(1);
}

const client = createAdsbLolClient({
  baseUrl: process.env.ADSB_BASE_URL ?? "https://api.adsb.lol",
  userAgent,
});

const { centre, radiusNm } = THRESHOLDS.poll;
const parsed = await client.fetchPoint({ lat: centre.lat, lon: centre.lon, radiusNm });
const { states, skipped } = adaptResponse(parsed);

console.log({
  now: new Date(parsed.now).toISOString(),
  received: parsed.aircraft.length,
  rejectedBySchema: parsed.rejected,
  skipped,
  aircraft: states.length,
  airborne: states.filter((s) => !s.last.onGround).length,
});
console.table(
  states.slice(0, 10).map((s) => ({
    hex: s.hex,
    callsign: s.callsign,
    type: s.typeCode,
    altFt: s.last.altFt,
    gsKt: s.last.gsKt,
    ageSec: Math.round(parsed.now / 1000 - s.lastPosTs),
  })),
);
