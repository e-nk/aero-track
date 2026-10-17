import { AIRLINES } from "./airlines";

// Search parsing (SPEC 12.6). Pure, shared by the api and the web app.

const BY_IATA = new Map<string, { icao: string; name: string }[]>();
const BY_ICAO = new Map<string, string>();
for (const a of AIRLINES) {
  BY_IATA.set(a.iata, [...(BY_IATA.get(a.iata) ?? []), { icao: a.icao, name: a.name }]);
  BY_ICAO.set(a.icao, a.name);
}

/** Upper case, no spaces or dashes ("vh-xzp" → "VHXZP"). */
export const normaliseQuery = (q: string) => q.toUpperCase().replace(/[\s-]+/g, "");

const FLIGHT = /^([A-Z0-9]{2})0*(\d{1,4})([A-Z]?)$/;

/** "QF1" → QFA1 (Qantas). Every airline sharing the IATA code is returned. */
export function flightNumberCallsigns(q: string): { callsign: string; airline: string }[] {
  const m = FLIGHT.exec(normaliseQuery(q));
  if (!m) return [];
  const [, iata, number, suffix] = m;
  return (BY_IATA.get(iata!) ?? []).map((a) => ({ callsign: `${a.icao}${number}${suffix}`, airline: a.name }));
}

/** The airline behind a callsign's three-letter prefix, if it is a known ICAO airline code. */
export function airlineForCallsign(callsign: string | null): { icao: string; name: string } | null {
  if (!callsign || callsign.length < 4) return null;
  const icao = callsign.slice(0, 3).toUpperCase();
  const name = BY_ICAO.get(icao);
  return name ? { icao, name } : null;
}

export interface ParsedSearch {
  query: string;
  callsign: string;
  flightCallsigns: { callsign: string; airline: string }[];
  registration: string;
  typeCode: string | null;
}

/** Every way a query could match. Null when it's too short or too long to search. */
export function parseSearch(raw: string): ParsedSearch | null {
  const query = normaliseQuery(raw);
  if (query.length < 2 || query.length > 20) return null;
  return {
    query,
    callsign: query,
    flightCallsigns: flightNumberCallsigns(query),
    registration: query,
    typeCode: /^[A-Z][A-Z0-9]{1,3}$/.test(query) ? query : null,
  };
}
