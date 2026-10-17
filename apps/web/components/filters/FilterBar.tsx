"use client";

import { useMemo } from "react";
import { CLASS_LABEL, airlineOptions, typeClassOptions } from "../../lib/filters";
import type { IconClass } from "../../lib/iconClass";
import { useAircraftStore } from "../../store/aircraftStore";

// Airline and aircraft-type filters (SPEC 12.6). Options list only what's on the map.

const selectClass =
  "max-w-[11rem] truncate rounded-full border border-white/10 bg-navy/90 px-3 py-1.5 text-sm text-text shadow-lg focus:border-sky focus:outline-none";

export function FilterBar() {
  const aircraft = useAircraftStore((s) => s.aircraft);
  const overview = useAircraftStore((s) => s.overview);
  const filters = useAircraftStore((s) => s.filters);
  const setFilters = useAircraftStore((s) => s.setFilters);

  const live = useMemo(() => Object.values(aircraft), [aircraft]);
  const airlines = useMemo(
    () => airlineOptions(live.map((a) => a.callsign), overview ? Object.values(overview.aircraft) : []),
    [live, overview],
  );
  const classes = useMemo(() => {
    const present = typeClassOptions(live);
    // Australia-wide aircraft have no type, so "Unknown type" is always offered when they're shown.
    return overview && !present.includes("unknown") && Object.keys(overview.aircraft).length ? [...present, "unknown" as const] : present;
  }, [live, overview]);
  const active = filters.airline !== null || filters.typeClass !== null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Filter by airline" className={selectClass} value={filters.airline ?? ""} onChange={(e) => setFilters({ airline: e.target.value || null })}>
        <option value="">All airlines</option>
        {filters.airline && !airlines.some((a) => a.icao === filters.airline) && <option value={filters.airline}>{filters.airline}</option>}
        {airlines.map((a) => (
          <option key={a.icao} value={a.icao}>
            {a.name} ({a.count})
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by aircraft type"
        className={selectClass}
        value={filters.typeClass ?? ""}
        onChange={(e) => setFilters({ typeClass: (e.target.value || null) as IconClass | null })}
      >
        <option value="">All aircraft types</option>
        {filters.typeClass && !classes.includes(filters.typeClass) && <option value={filters.typeClass}>{CLASS_LABEL[filters.typeClass]}</option>}
        {classes.map((c) => (
          <option key={c} value={c}>
            {CLASS_LABEL[c]}
          </option>
        ))}
      </select>
      {active && (
        <button onClick={() => setFilters({ airline: null, typeClass: null })} className="rounded-full bg-navy/90 px-3 py-1.5 text-sm text-sky shadow-lg hover:bg-white/5">
          Clear filters
        </button>
      )}
    </div>
  );
}
