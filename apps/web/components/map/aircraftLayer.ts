import type { CircleLayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { PALETTE } from "../../lib/palette";

export const AIRCRAFT_SOURCE = "aircraft";
export const TRACK_SOURCE = "selected-track";

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

// Ring around the selected aircraft.
export const selectedLayer = (hex: string | null): CircleLayerSpecification => ({
  id: "aircraft-selected",
  type: "circle",
  source: AIRCRAFT_SOURCE,
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
