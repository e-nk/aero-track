// Public, build-time configuration. Nothing secret belongs here (NEXT_PUBLIC_ is sent to browsers).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/fiord";

export const SYDNEY_VIEW = { longitude: 151.0, latitude: -33.9, zoom: 9 };

// Map data attribution (rule 9). OpenFreeMap, OpenMapTiles and OSM come from the tile source.
export const DATA_ATTRIBUTION =
  'Data: <a href="https://adsb.lol" target="_blank" rel="noopener">ADSB.lol</a> (ODbL)';
