/** A circle (polygon) of radiusNm around centre, for the "Live coverage area" outline. */
export function coverageCircle(centre: { lat: number; lon: number }, radiusNm: number, steps = 64) {
  const ring: [number, number][] = [];
  const cosLat = Math.cos((centre.lat * Math.PI) / 180);
  for (let i = 0; i <= steps; i++) {
    const bearing = ((i % steps) / steps) * 2 * Math.PI; // starts due north, closes on itself
    const dLat = (radiusNm / 60) * Math.cos(bearing);
    const dLon = ((radiusNm / 60) * Math.sin(bearing)) / cosLat;
    ring.push([centre.lon + dLon, centre.lat + dLat]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [ring] },
  };
}
