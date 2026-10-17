"use client";

import { useAircraftStore } from "../../store/aircraftStore";

/** Chips for followed flights, so they can be found anywhere on the map. */
export function FollowingList() {
  // Select the stored object itself: a selector that builds a new array each time loops forever.
  const follows = useAircraftStore((s) => s.follows)?.follows ?? [];
  const aircraft = useAircraftStore((s) => s.aircraft);
  const overview = useAircraftStore((s) => s.overview);
  const focusOn = useAircraftStore((s) => s.focusOn);
  if (!follows.length) return null;

  return (
    <nav aria-label="Followed flights" className="flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-navy/90 px-2.5 py-1 text-xs text-muted shadow-lg">Following</span>
      {follows.map((f) => {
        const callsign = aircraft[f.hex]?.callsign ?? overview?.aircraft[f.hex]?.callsign ?? null;
        return (
          <button
            key={f.hex}
            type="button"
            onClick={() => focusOn(f.hex)}
            className="rounded-full border border-sky/40 bg-navy/90 px-2.5 py-1 text-xs text-sky shadow-lg hover:bg-sky/10"
          >
            {callsign ?? f.hex}
            {f.landedAt !== null && <span className="text-muted"> · landed</span>}
          </button>
        );
      })}
    </nav>
  );
}
