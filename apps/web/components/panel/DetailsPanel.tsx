"use client";

import { THRESHOLDS } from "@aerotrack/shared";
import { useEffect } from "react";
import {
  NOT_AVAILABLE,
  displayAltitude,
  formatAge,
  formatHeading,
  formatSightings,
  formatSpeed,
  formatType,
  formatVerticalRate,
} from "../../lib/format";
import { openEventsFor } from "../../lib/liveState";
import { useNow } from "../../lib/useNow";
import { useAircraftStore } from "../../store/aircraftStore";
import { FollowButton } from "../follow/FollowButton";
import { AircraftPhoto } from "./AircraftPhoto";
import { EventCard } from "./EventCard";

function Row({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="py-1.5">
      <div className="flex justify-between gap-4">
        <dt className="text-muted">{label}</dt>
        <dd className={`text-right ${value === NOT_AVAILABLE ? "text-muted italic" : "text-text"}`}>{value}</dd>
      </div>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

// Right panel on desktop, bottom panel on mobile; never covers the map attribution.
const PANEL_CLASS =
  "absolute inset-x-0 bottom-11 z-20 max-h-[55dvh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-navy/95 p-4 text-text shadow-2xl backdrop-blur md:bottom-9 md:left-auto md:right-3 md:top-3 md:max-h-none md:w-96 md:rounded-2xl md:border";

function PanelHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full px-3 py-1 text-sm text-muted hover:bg-white/10 hover:text-text"
        aria-label="Close details"
      >
        Close
      </button>
    </header>
  );
}

/** Details for the selected aircraft (SPEC 12.4). Right panel on desktop, bottom panel on mobile. */
export function DetailsPanel() {
  const hex = useAircraftStore((s) => s.selectedHex);
  const live = useAircraftStore((s) => (s.selectedHex ? s.aircraft[s.selectedHex] : undefined));
  const selection = useAircraftStore((s) => s.selection);
  const events = useAircraftStore((s) => s.events);
  const overview = useAircraftStore((s) => s.overview);
  const recorded = useAircraftStore((s) => s.mode === "recorded");
  const followed = useAircraftStore((s) => !!hex && !!s.follows?.follows.some((f) => f.hex === hex));
  const select = useAircraftStore((s) => s.select);
  const now = useNow();

  useEffect(() => {
    if (!hex) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && select(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hex, select]);

  if (!hex) return null;

  // Australia-wide overview aircraft (not in the detailed set): basic fields only.
  const ov = !live ? overview?.aircraft[hex] : undefined;
  if (ov && overview) {
    const ovAge = now === null ? null : (overview.fetchedAt ?? ov.lastPosTs) - ov.lastPosTs + (now - overview.receivedAtMs) / 1000;
    return (
      <aside aria-label="Aircraft details" className={PANEL_CLASS}>
        <PanelHeader title={ov.callsign ?? "Callsign not available"} subtitle={`Australia-wide data · ${hex}`} onClose={() => select(null)} />
        <AircraftPhoto hex={hex} registration={null} />
        <FollowButton hex={hex} />
        <section aria-labelledby="ov-now-h" className="mb-5">
          <h3 id="ov-now-h" className="mb-1 text-xs uppercase tracking-wide text-muted">
            Now
          </h3>
          <dl className="divide-y divide-white/5 text-sm">
            <Row label="Altitude" value={displayAltitude(ov).text} note={displayAltitude(ov).note} />
            <Row label="Speed" value={formatSpeed(ov.gsKt)} />
            <Row label="Heading" value={formatHeading(ov.trackDeg)} />
            <Row label="Vertical speed" value={formatVerticalRate(ov.baroRateFpm, THRESHOLDS.display.levelRateFpm)} />
            <Row label="Last position" value={ovAge === null ? NOT_AVAILABLE : formatAge(ovAge)} />
          </dl>
        </section>
        <p className="text-sm text-text/90">
          Australia-wide data from the OpenSky Network, updated about every 90 seconds. Detailed insights are available near
          Sydney and for followed flights.
        </p>
      </aside>
    );
  }

  const detail = selection.detail;
  const state = detail?.state;
  const callsign = live?.callsign ?? state?.callsign ?? null;
  const open = openEventsFor(events, hex);
  const altitude = live ? displayAltitude(live) : null;
  const seen = formatSightings(detail?.sightings);
  const ageSec = live && now !== null ? live.serverNow - live.lastPosTs + (now - live.receivedAtMs) / 1000 : null;

  return (
    <aside aria-label="Aircraft details" className={PANEL_CLASS}>
      <PanelHeader title={callsign ?? "Callsign not available"} subtitle={`${recorded ? "Recorded data" : "Live data"} · ${hex}`} onClose={() => select(null)} />

      {selection.status === "not_found" && !live ? (
        <p className="text-sm text-text/90">
          We can&apos;t see this aircraft right now. That doesn&apos;t mean the flight isn&apos;t operating.
        </p>
      ) : (
        <>
          <AircraftPhoto hex={hex} registration={state?.registration ?? null} />
          {!recorded && <FollowButton hex={hex} />}
          {!recorded && followed && (
            <p className="mb-4 text-xs leading-snug text-muted">
              Following this flight worldwide, updated about every 30 seconds wherever ADSB.lol has receivers. There&apos;s
              usually no receiver coverage over the ocean, so it can disappear for hours; the last known position is shown.
              We only show where it landed once we see it land.
            </p>
          )}

          <section aria-labelledby="identity-h" className="mb-4">
            <h3 id="identity-h" className="sr-only">
              Identity
            </h3>
            <dl className="divide-y divide-white/5 text-sm">
              <Row label="Registration" value={state?.registration ?? NOT_AVAILABLE} />
              <Row label="Aircraft type" value={formatType(live?.typeCode ?? state?.typeCode ?? null, state?.typeDesc ?? null)} />
              {seen && <Row label="Seen by AeroTrack" value={seen.text} note={seen.note} />}
            </dl>
          </section>

          <section aria-labelledby="now-h" className="mb-5">
            <h3 id="now-h" className="mb-1 text-xs uppercase tracking-wide text-muted">
              Now
            </h3>
            {live ? (
              <dl className="divide-y divide-white/5 text-sm">
                <Row label="Altitude" value={altitude!.text} note={altitude!.note} />
                <Row label="Speed" value={formatSpeed(live.gsKt)} />
                <Row label="Heading" value={formatHeading(live.trackDeg)} />
                <Row label="Vertical speed" value={formatVerticalRate(live.baroRateFpm, THRESHOLDS.display.levelRateFpm)} />
                <Row label="Last position" value={ageSec === null ? NOT_AVAILABLE : formatAge(ageSec)} />
              </dl>
            ) : (
              <p className="text-sm text-muted">Waiting for the next live update…</p>
            )}
          </section>

          <section aria-labelledby="insights-h">
            <h3 id="insights-h" className="mb-2 text-xs uppercase tracking-wide text-muted">
              Insights
            </h3>
            <div className="space-y-3">
              {open.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
              {detail?.history === "insufficient_history" && (
                <p className="text-sm text-text/90">Insights appear after about a minute of observations.</p>
              )}
              {detail?.history === "ok" && open.length === 0 && (
                <p className="text-sm text-text/90">No notable changes in the last few minutes.</p>
              )}
              {selection.status === "loading" && !detail && <p className="text-sm text-muted">Loading…</p>}
              {selection.status === "error" && (
                <p className="text-sm text-amber">Couldn&apos;t refresh the details. Trying again with the next update.</p>
              )}
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
