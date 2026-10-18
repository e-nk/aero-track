"use client";

import { useState } from "react";
import { unfollowFlight } from "../../lib/api";
import { useAircraftStore } from "../../store/aircraftStore";

/** Chips for followed flights: tap to find one on the map, × to stop following it. */
export function FollowingList() {
  // Select the stored object itself: a selector that builds a new array each time loops forever.
  const follows = useAircraftStore((s) => s.follows)?.follows ?? [];
  const aircraft = useAircraftStore((s) => s.aircraft);
  const overview = useAircraftStore((s) => s.overview);
  const focusOn = useAircraftStore((s) => s.focusOn);
  const watched = useAircraftStore((s) => s.watched);
  const unwatch = useAircraftStore((s) => s.unwatch);
  const [removing, setRemoving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!follows.length) return null;

  async function stop(hex: string) {
    setRemoving(hex);
    setMessage(null);
    unwatch(hex);
    const result = await unfollowFlight(hex);
    setRemoving(null);
    if (!result.ok) setMessage(result.message);
    // On success the server broadcasts the new list and the chip disappears.
  }

  return (
    <nav aria-label="Followed flights" className="flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-navy/90 px-2.5 py-1 text-xs text-muted shadow-lg">Following</span>
      {follows.map((f) => {
        const callsign = aircraft[f.hex]?.callsign ?? overview?.aircraft[f.hex]?.callsign ?? null;
        const name = callsign ?? f.hex;
        return (
          <span key={f.hex} className="inline-flex items-center rounded-full border border-sky/40 bg-navy/90 text-xs text-sky shadow-lg">
            <button type="button" onClick={() => focusOn(f.hex)} className="rounded-l-full py-1 pl-2.5 pr-1.5 hover:bg-sky/10">
              {watched.includes(f.hex) && <span aria-label="watching">🔔 </span>}
              {name}
              {f.landedAt !== null && <span className="text-muted"> · landed</span>}
            </button>
            <button
              type="button"
              onClick={() => stop(f.hex)}
              disabled={removing === f.hex}
              aria-label={`Stop following ${name}`}
              title={`Stop following ${name}`}
              className="rounded-r-full border-l border-sky/30 py-1 pl-1.5 pr-2.5 text-muted hover:bg-sky/10 hover:text-text disabled:opacity-50"
            >
              ×
            </button>
          </span>
        );
      })}
      {message && <span className="rounded-full bg-navy/90 px-2.5 py-1 text-xs text-text shadow-lg">{message}</span>}
    </nav>
  );
}
