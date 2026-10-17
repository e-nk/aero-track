import type { CircleLayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { PALETTE } from "../../lib/palette";

export const AIRCRAFT_SOURCE = "aircraft";
export const TRACK_SOURCE = "selected-track";
export const OVERVIEW_SOURCE = "overview";
export const COVERAGE_SOURCE = "coverage";

// One symbol layer for every aircraft (SPEC 12.3). No HTML markers.
export const aircraftLayer: SymbolLayerSpecification = {
  id: "aircraft",
  type: "symbol",
  source: AIRCRAFT_SOURCE,
  layout: {
    "icon-image": ["concat", ["get", "icon"], "-", ["get", "band"]],
    "icon-rotate": ["get", "rotation"],
    "icon-rotation-alignment": "map",
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.55, 10, 0.8, 14, 1.1],
    // Callsign labels once zoomed in a little; missing callsigns show nothing.
    "text-field": ["step", ["zoom"], "", 9, ["coalesce", ["get", "callsign"], ""]],
    "text-font": ["Noto Sans Regular"],
    "text-size": 11,
    "text-offset": [0, 1.4],
    "text-anchor": "top",
    "text-optional": true,
  },
  paint: {
    "icon-opacity": ["case", ["get", "stale"], 0.45, 1],
    "text-color": PALETTE.text,
    "text-halo-color": PALETTE.navy,
    "text-halo-width": 1.2,
    "text-opacity": ["case", ["get", "stale"], 0.5, 0.9],
  },
};

// Small dot on aircraft with an open event.
export const eventBadgeLayer: CircleLayerSpecification = {
  id: "aircraft-event-badge",
  type: "circle",
  source: AIRCRAFT_SOURCE,
  filter: ["==", ["get", "hasEvent"], true],
  paint: {
    "circle-radius": 3.5,
    "circle-color": PALETTE.sky,
    "circle-stroke-color": PALETTE.navy,
    "circle-stroke-width": 1.5,
    "circle-translate": [10, -10],
    "circle-translate-anchor": "viewport",
  },
};

// Australia-wide overview (SPEC 11.10): smaller, lighter, labels only when zoomed in.
export const overviewLayer: SymbolLayerSpecification = {
  ...aircraftLayer,
  id: "overview",
  source: OVERVIEW_SOURCE,
  layout: {
    ...aircraftLayer.layout,
    "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 8, 0.6, 12, 0.85],
    "text-field": ["step", ["zoom"], "", 8, ["coalesce", ["get", "callsign"], ""]],
  },
  paint: { ...aircraftLayer.paint, "icon-opacity": ["case", ["get", "stale"], 0.35, 0.8] },
};

// Outline of the detailed live area around Sydney.
export const coverageLineLayer: LineLayerSpecification = {
  id: "coverage-line",
  type: "line",
  source: COVERAGE_SOURCE,
  paint: { "line-color": PALETTE.teal, "line-width": 1.2, "line-opacity": 0.5, "line-dasharray": [3, 3] },
};

export const coverageLabelLayer: SymbolLayerSpecification = {
  id: "coverage-label",
  type: "symbol",
  source: COVERAGE_SOURCE,
  minzoom: 6,
  layout: {
    "symbol-placement": "line",
    "text-field": "Live coverage area (detailed insights)",
    "text-font": ["Noto Sans Regular"],
    "text-size": 11,
  },
  paint: { "text-color": PALETTE.teal, "text-halo-color": PALETTE.navy, "text-halo-width": 1.2, "text-opacity": 0.8 },
};

// Ring around the selected aircraft, on whichever layer draws it.
export const selectedLayer = (hex: string | null, source = AIRCRAFT_SOURCE): CircleLayerSpecification => ({
  id: `${source}-selected`,
  type: "circle",
  source,
  filter: ["==", ["get", "hex"], hex ?? ""],
  paint: {
    "circle-radius": 16,
    "circle-color": "rgba(0,0,0,0)",
    "circle-stroke-color": PALETTE.sky,
    "circle-stroke-width": 2,
  },
});

// Selected aircraft's recent track. A MultiLineString, so gaps stay gaps.
export const trackLayer: LineLayerSpecification = {
  id: "selected-track",
  type: "line",
  source: TRACK_SOURCE,
  layout: { "line-cap": "round", "line-join": "round" },
  paint: { "line-color": PALETTE.sky, "line-width": 2, "line-opacity": 0.8 },
};
