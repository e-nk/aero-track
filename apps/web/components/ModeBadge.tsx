"use client";

import { THRESHOLDS } from "@aerotrack/shared";
import { useEffect, useState } from "react";
import { liveBadge, type BadgeTone } from "../lib/badge";
import { useAircraftStore } from "../store/aircraftStore";

const DOT: Record<BadgeTone, string> = {
  live: "bg-teal",
  pending: "bg-muted",
  stale: "bg-amber",
  down: "bg-amber",
};

/** Always-visible data mode badge (SPEC 12.2). */
export function ModeBadge() {
  const state = useAircraftStore();
  // Read the clock only in the browser, after mount (never during prerender).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const badge = liveBadge(state, now ?? state.lastSnapshotAt ?? 0, THRESHOLDS.display.staleAfterSec);
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-full border border-white/10 bg-navy/90 px-3 py-1.5 text-sm text-text shadow-lg backdrop-blur"
    >
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[badge.tone]}`} />
      <span className={badge.tone === "stale" || badge.tone === "down" ? "text-amber" : undefined}>{badge.text}</span>
    </div>
  );
}
