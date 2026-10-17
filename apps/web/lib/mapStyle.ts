import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

// Offline map style (SPEC 5.3, 13): Protomaps basemap from a local PMTiles file,
// with fonts and sprites served by the app. Assets come from
// `pnpm --filter web offline:assets` into public/offline/.

/** Fonts copied into public/offline/fonts by the offline assets script. */
export const OFFLINE_FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic", "Noto Sans Devanagari Regular v1"];

/** origin: the page's own origin (MapLibre needs absolute URLs for glyphs, sprites and tiles). */
export function offlineStyle(origin: string): StyleSpecification {
  return {
    version: 8,
    glyphs: `${origin}/offline/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/offline/sprites/v4/dark`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${origin}/offline/sydney.pmtiles`,
        attribution:
          '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a> © <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      },
    },
    layers: layers("protomaps", namedFlavor("dark"), { lang: "en" }),
  };
}
