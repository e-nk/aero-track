import { API_URL } from "./config";

export interface SearchResult {
  hex: string;
  callsign: string | null;
  registration: string | null;
  typeCode: string | null;
  matchedBy: "callsign" | "flight_prefix" | "registration" | "type";
  freshness: string;
  source: "detailed" | "overview" | "history";
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  message: string | null;
}

/** GET /api/search (SPEC 12.6). Failures become a calm message, never an error. */
export async function searchAircraft(q: string, doFetch: typeof fetch = fetch, signal?: AbortSignal): Promise<SearchResponse> {
  try {
    const res = await doFetch(`${API_URL}/api/search?q=${encodeURIComponent(q)}`, { signal });
    if (res.ok) return (await res.json()) as SearchResponse;
  } catch {
    // fall through
  }
  return { query: q.toUpperCase(), results: [], message: "Search isn't available right now. Please try again." };
}
