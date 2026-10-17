"use client";

import { THRESHOLDS } from "@aerotrack/shared";
import { setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
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
import { AUSTRALIA_VIEW, DATA_ATTRIBUTION, MAP_STYLE_URL, OPENSKY_ATTRIBUTION } from "../../lib/config";
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

export default function AircraftMap() {
  const mapRef = useRef<MapRef>(null);
  const [iconsReady, setIconsReady] = useState(false);
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
    // The basemap style references a few sprite icons its sprite sheet lacks
    // (e.g. "circle-11"). Give them a blank image instead of console warnings.
    map.on("styleimagemissing", ({ id }) => {
      if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
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
        const { aircraft, overview } = useAircraftStore.getState();
        const live = Object.values(aircraft);
        const now = Date.now();
        (map?.getSource(AIRCRAFT_SOURCE) as GeoJSONSource | undefined)?.setData(buildAircraftFeatures(live, now, THRESHOLDS.display));
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

  return (
    <Map
      ref={mapRef}
      initialViewState={AUSTRALIA_VIEW}
      mapStyle={MAP_STYLE_URL}
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
