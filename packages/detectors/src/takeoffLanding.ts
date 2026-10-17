import type { Detection, Observation } from "@aerotrack/shared";
import type { DetectContext } from "./context";
import { splitGaps } from "./gaps";
import { nearestAirport } from "./geo";

/**
 * SPEC 9.11. Both sides of a change are confirmed by confirmObs reports, so a
 * single flickering ground flag is never a take-off or landing.
 * Take-off: ground → airborne, gaining minClimbFt over the confirming reports.
 * Landing: airborne, last report at or below maxTouchdownAltFt → ground.
 * Transitions never straddle a gap. Reports the most recent of each.
 */
export function detectTakeoffLanding(track: Observation[], ctx: DetectContext): Detection[] {
  const th = ctx.thresholds.takeoffLanding;
  const { segments } = splitGaps(track, ctx.thresholds);
  let takeoff: Detection | null = null;
  let landing: Detection | null = null;

  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) {
      const before = seg[i - 1]!;
      const at = seg[i]!;
      const next = seg.slice(i, i + th.confirmObs);
      if (next.length < th.confirmObs) break;

      const prior = seg.slice(Math.max(0, i - th.confirmObs), i);
      const priorAll = (ground: boolean) => prior.length === th.confirmObs && prior.every((o) => o.onGround === ground);

      if (priorAll(true) && !at.onGround && next.every((o) => !o.onGround)) {
        const end = next.at(-1)!;
        const gained = at.altFt !== null && end.altFt !== null ? end.altFt - at.altFt : null;
        if (gained !== null && gained >= th.minClimbFt) {
          takeoff = build("takeoff", at, end, ctx, { altFt: end.altFt! });
        }
      }

      if (
        priorAll(false) &&
        before.altFt !== null &&
        before.altFt <= th.maxTouchdownAltFt &&
        at.onGround &&
        next.every((o) => o.onGround)
      ) {
        landing = build("landing", at, next.at(-1)!, ctx, {});
      }
    }
  }
  return [takeoff, landing].filter((d): d is Detection => d !== null);
}

function build(
  type: "takeoff" | "landing",
  at: Observation,
  confirmedBy: Observation,
  ctx: DetectContext,
  extra: Detection["evidence"],
): Detection {
  const near = nearestAirport(at.lat, at.lon, ctx.thresholds.takeoffLanding.airportRadiusKm);
  return {
    type,
    confidence: "observed",
    windowStart: at.t,
    windowEnd: confirmedBy.t,
    evidence: {
      at: at.t,
      ...(near && {
        airport: near.airport.ident,
        airportName: near.airport.name,
        airportKm: Math.round(near.km * 10) / 10,
      }),
      ...extra,
    },
  };
}
