"use client";

import { THRESHOLDS } from "@aerotrack/shared";
import { addProtocol, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import Map, {
  AttributionControl,
  Layer,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { buildAircraftFeatures } from "../../lib/aircraftFeatures";
import { AUSTRALIA_VIEW, DATA_ATTRIBUTION, MAP_STYLE_URL, OFFLINE, OPENSKY_ATTRIBUTION } from "../../lib/config";
import { offlineStyle } from "../../lib/mapStyle";
import { coverageCircle } from "../../lib/coverage";
import { buildOverviewFeatures } from "../../lib/overviewFeatures";
import { trackFeature } from "../../lib/trackFeature";
import { useAircraftStore } from "../../store/aircraftStore";
import {
  AIRCRAFT_SOURCE,
  COVERAGE_SOURCE,
  OVERVIEW_SOURCE,
  TRACK_SOURCE,
  aircraftLayer,
  coverageLabelLayer,
  coverageLineLayer,
  eventBadgeLayer,
  overviewLayer,
  selectedLayer,
  trackLayer,
} from "./aircraftLayer";
import { addAircraftIcons } from "./icons";

// Served from /public (copied by scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre-gl-worker.mjs");
// Offline: tiles come from public/offline/sydney.pmtiles through the pmtiles:// protocol (SPEC 13).
if (OFFLINE) addProtocol("pmtiles", new Protocol().tile);

const EMPTY = { type: "FeatureCollection" as const, features: [] };
const COVERAGE = coverageCircle(THRESHOLDS.poll.centre, THRESHOLDS.poll.radiusNm);

// Panel sizes from DetailsPanel: bottom 55% on mobile, 24rem (+ margin) on the right from md.
const MD_BREAKPOINT_PX = 768;
const DESKTOP_PANEL_PX = 408;
const MOBILE_PANEL_SHARE = 0.55;

/** If the tapped aircraft would sit under the details panel, ease it into view. */
function revealUnderPanel(e: MapLayerMouseEvent) {
  const map = e.target;
  const { width, height } = map.getContainer().getBoundingClientRect();
  const mobile = width < MD_BREAKPOINT_PX;
  const covered = mobile ? e.point.y > height * (1 - MOBILE_PANEL_SHARE) : e.point.x > width - DESKTOP_PANEL_PX;
  if (!covered) return;
  map.easeTo({
    center: e.lngLat,
    padding: mobile ? { bottom: height * MOBILE_PANEL_SHARE } : { right: DESKTOP_PANEL_PX },
    duration: 600,
  });
}

/** initialBounds ([west, south, east, north]) fits the map to a recording; otherwise all of Australia. */
export default function AircraftMap({ initialBounds }: { initialBounds?: [number, number, number, number] } = {}) {
  const mapRef = useRef<MapRef>(null);
  const [iconsReady, setIconsReady] = useState(false);
  const [mapStyle] = useState<string | StyleSpecification>(() => (OFFLINE ? offlineStyle(window.location.origin) : MAP_STYLE_URL));
  const [cursor, setCursor] = useState<string>("");
  const selectedHex = useAircraftStore((s) => s.selectedHex);
  const segments = useAircraftStore((s) => s.selection.segments);
  const select = useAircraftStore((s) => s.select);
  const track = trackFeature(segments) ?? EMPTY;
  // OpenSky attribution only while overview aircraft are shown (rule 9).
  const showsOverview = useAircraftStore((s) => !!s.overview && Object.keys(s.overview.aircraft).length > 0);
  const attribution = showsOverview ? `${DATA_ATTRIBUTION} · ${OPENSKY_ATTRIBUTION}` : DATA_ATTRIBUTION;

  // Click an aircraft to select it; click empty map to clear.
  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const hex = e.features?.[0]?.properties?.hex;
      if (typeof hex !== "string") return select(null);
      select(hex);
      revealUnderPanel(e);
    },
    [select],
  );

  const onLoad = useCallback(async () => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    await addAircraftIcons(map);
    setIconsReady(true);
  }, []);

  // Between updates, redraw dead-reckoned positions at most every sourceUpdateMs.
  // Reads the store directly so React doesn't re-render on every frame.
  useEffect(() => {
    if (!iconsReady) return;
    let frame = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last >= THRESHOLDS.display.sourceUpdateMs) {
        last = t;
        const map = mapRef.current?.getMap();
        const { aircraft, overview, follows } = useAircraftStore.getState();
        const live = Object.values(aircraft);
        const now = Date.now();
        const followed = new Set(follows?.follows.map((f) => f.hex));
        (map?.getSource(AIRCRAFT_SOURCE) as GeoJSONSource | undefined)?.setData(
          buildAircraftFeatures(live, now, THRESHOLDS.display, followed),
        );
        if (overview) {
          const skip = new Set(live.map((a) => a.hex));
          (map?.getSource(OVERVIEW_SOURCE) as GeoJSONSource | undefined)?.setData(
            buildOverviewFeatures(overview, skip, now, THRESHOLDS.display),
          );
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [iconsReady]);

  // The basemap style references a few sprite icons its sprite sheet lacks
  // (e.g. "circle-11"). Register as soon as the map exists, before the style asks.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    map?.setMissingStyleImageResolver((id) => {
      if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
  }, []);

  // Fly to an aircraft chosen from the Following list.
  const focus = useAircraftStore((s) => s.focus);
  useEffect(() => {
    if (!focus) return;
    const { aircraft, overview } = useAircraftStore.getState();
    const a = aircraft[focus.hex] ?? overview?.aircraft[focus.hex];
    const map = mapRef.current?.getMap();
    if (a && map) map.flyTo({ center: [a.lon, a.lat], zoom: Math.max(map.getZoom(), 6), duration: 1200 });
  }, [focus]);

  return (
    <Map
      ref={mapRef}
      initialViewState={initialBounds ? { bounds: initialBounds, fitBoundsOptions: { padding: { top: 70, bottom: 170, left: 40, right: 40 }, maxZoom: 10 } /* room for header and replay controls */ } : AUSTRALIA_VIEW}
      mapStyle={mapStyle}
      attributionControl={false}
      onLoad={onLoad}
      interactiveLayerIds={iconsReady ? [aircraftLayer.id, overviewLayer.id] : []}
      onClick={onClick}
      onMouseEnter={() => setCursor("pointer")}
      onMouseLeave={() => setCursor("")}
      cursor={cursor}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* Remount when the text changes: the control reads customAttribution once. */}
      <AttributionControl key={attribution} customAttribution={attribution} compact={false} position="bottom-right" />
      <NavigationControl position="top-left" showCompass={false} />
      {iconsReady && (
        <>
          <Source id={COVERAGE_SOURCE} type="geojson" data={COVERAGE}>
            <Layer {...coverageLineLayer} />
            <Layer {...coverageLabelLayer} />
          </Source>
          <Source id={OVERVIEW_SOURCE} type="geojson" data={EMPTY}>
            <Layer {...selectedLayer(selectedHex, OVERVIEW_SOURCE)} />
            <Layer {...overviewLayer} />
          </Source>
          <Source id={TRACK_SOURCE} type="geojson" data={track}>
            <Layer {...trackLayer} />
          </Source>
          <Source id={AIRCRAFT_SOURCE} type="geojson" data={EMPTY}>
            <Layer {...selectedLayer(selectedHex)} />
            <Layer {...aircraftLayer} />
            <Layer {...eventBadgeLayer} />
          </Source>
        </>
      )}
    </Map>
  );
}
