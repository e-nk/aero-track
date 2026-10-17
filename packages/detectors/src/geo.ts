import { AIRPORTS, type Airport } from "@aerotrack/shared";

/** Signed shortest heading change from a to b, in degrees (-180..180). Right turns are positive. */
export const dHeading = (a: number, b: number) => ((b - a + 540) % 360) - 180;

const EARTH_RADIUS_NM = 3440.065;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in nautical miles. */
export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const KM_PER_NM = 1.852;

/** Nearest known airport within maxKm, or null. */
export function nearestAirport(
  lat: number,
  lon: number,
  maxKm: number,
  airports: readonly Airport[] = AIRPORTS,
): { airport: Airport; km: number } | null {
  let best: { airport: Airport; km: number } | null = null;
  for (const airport of airports) {
    const km = distanceNm(lat, lon, airport.lat, airport.lon) * KM_PER_NM;
    if (km <= maxKm && (!best || km < best.km)) best = { airport, km };
  }
  return best;
}
