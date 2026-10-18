"use client";

import { useState } from "react";
import { followFlight, unfollowFlight } from "../../lib/api";
import { useAircraftStore } from "../../store/aircraftStore";

const FULL = "You're watching as many flights as AeroTrack can follow at once (10). Stop watching one first.";

/** Watch a flight for alerts. Live: also follows it on the server so it's tracked worldwide (option A). */
export function WatchButton({ hex }: { hex: string }) {
  const recorded = useAircraftStore((s) => s.mode === "recorded");
  const watching = useAircraftStore((s) => (s.mode === "recorded" ? s.replayWatch : s.watched).includes(hex));
  const watch = useAircraftStore((s) => s.watch);
  const unwatch = useAircraftStore((s) => s.unwatch);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    setMessage(null);
    if (watching) {
      unwatch(hex);
      if (!recorded) {
        setBusy(true);
        const r = await unfollowFlight(hex);
        setBusy(false);
        if (!r.ok) setMessage(r.message);
      }
      return;
    }
    if (!recorded) {
      setBusy(true);
      const r = await followFlight(hex);
      setBusy(false);
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
    }
    if (!watch(hex, Date.now() / 1000)) setMessage(FULL);
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={watching}
        className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
          watching ? "border border-sky/50 text-sky hover:bg-sky/10" : "bg-sky text-navy hover:bg-sky/90"
        }`}
      >
        {busy ? "One moment…" : watching ? "🔔 Watching · Stop watching" : "Watch this flight"}
      </button>
      <p className="mt-1.5 text-xs text-muted">
        {watching ? "You'll get an alert when it takes off, lands, circles or stops reporting." : "Get calm, plain-English alerts while AeroTrack is open."}
      </p>
      {message && <p className="mt-2 text-sm text-text/90">{message}</p>}
    </div>
  );
}
