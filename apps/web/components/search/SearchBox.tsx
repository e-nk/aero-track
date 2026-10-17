"use client";

import { useEffect, useRef, useState } from "react";
import { freshnessText } from "../../lib/filters";
import { searchAircraft, type SearchResponse, type SearchResult } from "../../lib/searchApi";
import { useAircraftStore } from "../../store/aircraftStore";

// Search by callsign, flight number, registration or type (SPEC 12.6). Live mode only.

const DEBOUNCE_MS = 300;

const MATCHED: Record<SearchResult["matchedBy"], string> = {
  callsign: "Callsign",
  flight_prefix: "Flight number",
  registration: "Registration",
  type: "Aircraft type",
};

export function SearchBox() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [open, setOpen] = useState(false);
  const focusOn = useAircraftStore((s) => s.focusOn);
  const boxRef = useRef<HTMLDivElement>(null);

  const query = q.trim();
  const searchable = query.replace(/[\s-]/g, "").length >= 2;

  useEffect(() => {
    if (!searchable) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      searchAircraft(query, fetch, ctrl.signal).then((r) => {
        if (!ctrl.signal.aborted) setRes(r);
      });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, searchable]);

  // Close the results when clicking elsewhere.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const choose = (r: SearchResult) => {
    focusOn(r.hex);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative w-72 max-w-[calc(100vw-1.5rem)]">
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Search flight, callsign or registration"
        aria-label="Search aircraft"
        className="w-full rounded-full border border-white/10 bg-navy/90 px-4 py-1.5 text-sm text-text shadow-lg placeholder:text-muted focus:border-sky focus:outline-none"
      />
      {open && searchable && res && (
        <div role="listbox" aria-label="Search results" className="absolute left-0 right-0 top-full mt-1 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-navy/95 p-1 text-sm text-text shadow-lg">
          {res.results.length === 0 && <p className="px-3 py-2 text-muted">{res.message}</p>}
          {res.results.map((r) => {
            const live = r.freshness === "live";
            const name = r.callsign ?? r.registration ?? r.hex;
            const detail = [MATCHED[r.matchedBy], r.typeCode, r.callsign && r.registration].filter(Boolean).join(" · ");
            const body = (
              <>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{name}</span>
                  <span className={`text-xs ${live ? "text-teal" : "text-muted"}`}>{freshnessText(r.freshness)}</span>
                </span>
                <span className="block text-xs text-muted">{detail}</span>
              </>
            );
            return live ? (
              <button key={r.hex} role="option" aria-selected={false} onClick={() => choose(r)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5">
                {body}
              </button>
            ) : (
              <div key={r.hex} className="px-3 py-2 opacity-80">
                {body}
                <span className="block text-xs text-muted">Not on the map right now.</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
