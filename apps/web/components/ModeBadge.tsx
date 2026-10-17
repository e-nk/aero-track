"use client";

import { THRESHOLDS } from "@aerotrack/shared";
import { liveBadge, overviewBadge, recordedBadge, type Badge, type BadgeTone } from "../lib/badge";
import { useNow } from "../lib/useNow";
import { useAircraftStore } from "../store/aircraftStore";

const DOT: Record<BadgeTone, string> = {
  live: "bg-teal",
  pending: "bg-muted",
  stale: "bg-amber",
  down: "bg-amber",
};

function Pill({ badge }: { badge: Badge }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-navy/90 px-3 py-1.5 text-sm text-text shadow-lg backdrop-blur">
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[badge.tone]}`} />
      <span className={badge.tone === "stale" || badge.tone === "down" ? "text-amber" : undefined}>{badge.text}</span>
    </div>
  );
}

/** Always-visible data mode badge (SPEC 12.2), plus the Australia-wide overview's freshness. */
export function ModeBadge() {
  const state = useAircraftStore();
  const now = useNow();
  if (state.mode === "recorded" && state.replay) {
    return (
      <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2">
        <Pill badge={recordedBadge(state.replay)} />
      </div>
    );
  }
  const badge = liveBadge(state, now ?? state.lastSnapshotAt ?? 0, THRESHOLDS.display.staleAfterSec);
  const overview = now === null ? null : overviewBadge(state.overview, now);
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2">
      <Pill badge={badge} />
      {overview && <Pill badge={overview} />}
    </div>
  );
}
