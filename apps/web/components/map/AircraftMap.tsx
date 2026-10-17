"use client";

import { THRESHOLDS } from "@aerotrack/shared";
import { setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import Map, { AttributionControl, Layer, NavigationControl, Source, type MapRef } from "react-map-gl/maplibre";
import { buildAircraftFeatures } from "../../lib/aircraftFeatures";
import { DATA_ATTRIBUTION, MAP_STYLE_URL, SYDNEY_VIEW } from "../../lib/config";
import { useAircraftStore } from "../../store/aircraftStore";
import { AIRCRAFT_SOURCE, aircraftLayer, eventBadgeLayer } from "./aircraftLayer";
import { addAircraftIcons } from "./icons";

// Served from /public (copied by scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre-gl-worker.mjs");

const EMPTY = { type: "FeatureCollection" as const, features: [] };

export default function AircraftMap() {
  const mapRef = useRef<MapRef>(null);
  const [iconsReady, setIconsReady] = useState(false);

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
        const source = mapRef.current?.getMap().getSource(AIRCRAFT_SOURCE) as GeoJSONSource | undefined;
        const aircraft = Object.values(useAircraftStore.getState().aircraft);
        source?.setData(buildAircraftFeatures(aircraft, Date.now(), THRESHOLDS.display));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [iconsReady]);

  return (
    <Map
      ref={mapRef}
      initialViewState={SYDNEY_VIEW}
      mapStyle={MAP_STYLE_URL}
      attributionControl={false}
      onLoad={onLoad}
      style={{ position: "absolute", inset: 0 }}
    >
      <AttributionControl customAttribution={DATA_ATTRIBUTION} compact={false} position="bottom-right" />
      <NavigationControl position="top-right" showCompass={false} />
      {iconsReady && (
        <Source id={AIRCRAFT_SOURCE} type="geojson" data={EMPTY}>
          <Layer {...aircraftLayer} />
          <Layer {...eventBadgeLayer} />
        </Source>
      )}
    </Map>
  );
}
