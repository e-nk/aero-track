import type { AircraftState, Observation } from "@aerotrack/shared";

export const T0 = 1_792_200_000;

export const obs = (t: number, patch: Partial<Observation> = {}): Observation => ({
  t,
  lat: -33.9,
  lon: 151.0,
  altFt: 10000,
  onGround: false,
  gsKt: 250,
  trackDeg: 90,
  baroRateFpm: 0,
  ...patch,
});

export const state = (hex: string, last: Observation, patch: Partial<AircraftState> = {}): AircraftState => ({
  hex,
  callsign: "TEST01",
  registration: null,
  typeCode: "B738",
  typeDesc: null,
  category: "A3",
  squawk: "1000",
  emergency: null,
  last,
  lastPosTs: last.t,
  mode: "live",
  ...patch,
});
