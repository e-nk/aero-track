// Public, build-time configuration. Nothing secret belongs here (NEXT_PUBLIC_ is sent to browsers).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/fiord";

// Opens on all of Australia; the detailed live area around Sydney is outlined (SPEC 11.10).
export const AUSTRALIA_VIEW = { longitude: 134.5, latitude: -27.5, zoom: 3.6 };

// Map data attribution (rule 9). OpenFreeMap, OpenMapTiles and OSM come from the tile source.
export const DATA_ATTRIBUTION =
  'Data: <a href="https://adsb.lol" target="_blank" rel="noopener">ADSB.lol</a> (ODbL)';
export const OPENSKY_ATTRIBUTION =
  'Data: <a href="https://opensky-network.org" target="_blank" rel="noopener">The OpenSky Network</a>';
