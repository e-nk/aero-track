import { ProviderError } from "../errors";
import { parseResponse, type ParsedResponse } from "./schema";

export { ProviderError, type ProviderErrorKind } from "../errors";

export interface AdsbLolClientOptions {
  baseUrl: string;
  userAgent: string; // required: adsb.lol returns 403 without one
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface PointQuery {
  lat: number;
  lon: number;
  radiusNm: number;
}

export function createAdsbLolClient(opts: AdsbLolClientOptions) {
  if (!opts.userAgent.trim()) throw new Error("adsb.lol client needs a User-Agent");
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const base = opts.baseUrl.replace(/\/+$/, "");

  async function get(path: string): Promise<ParsedResponse> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        headers: { "User-Agent": opts.userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      throw timedOut
        ? new ProviderError("timeout", `adsb.lol did not respond within ${timeoutMs} ms`, undefined, { cause: e })
        : new ProviderError("network", "Could not reach adsb.lol", undefined, { cause: e });
    }

    // A 429 is an nginx HTML page with no Retry-After. Never parse it as data.
    if (res.status === 429) throw new ProviderError("rate_limited", "adsb.lol rate limit hit", 429);
    if (!res.ok) throw new ProviderError("http", `adsb.lol returned HTTP ${res.status}`, res.status);

    let body: unknown;
    try {
      body = JSON.parse(await res.text());
    } catch (e) {
      throw new ProviderError("invalid_body", "adsb.lol response was not JSON", res.status, { cause: e });
    }
    try {
      return parseResponse(body);
    } catch (e) {
      throw new ProviderError("invalid_body", "adsb.lol response did not match the schema", res.status, { cause: e });
    }
  }

  return {
    fetchPoint: ({ lat, lon, radiusNm }: PointQuery) => get(`/v2/point/${lat}/${lon}/${radiusNm}`),
  };
}

export type AdsbLolClient = ReturnType<typeof createAdsbLolClient>;
