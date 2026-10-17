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
