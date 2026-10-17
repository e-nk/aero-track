import { ProviderError } from "../errors";
import { parseStates, type ParsedStates } from "./schema";

const TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const STATES_URL = "https://opensky-network.org/api/states/all";
const REFRESH_EARLY_MS = 60_000; // tokens last 30 min; renew a minute early

export interface TokenProviderOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  now?: () => number;
}

/** OAuth2 client-credentials token, cached until shortly before it expires (SPEC 5.8). */
export function createTokenProvider(opts: TokenProviderOptions) {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  let token: { value: string; expiresAt: number } | null = null;

  return {
    async get(force = false): Promise<string> {
      if (!force && token && now() < token.expiresAt - REFRESH_EARLY_MS) return token.value;
      const res = await doFetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: opts.clientId,
          client_secret: opts.clientSecret,
        }).toString(),
      });
      if (!res.ok) throw new Error(`OpenSky token request failed (${res.status})`);
      const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
      if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
        throw new Error("OpenSky token response was not understood");
      }
      token = { value: body.access_token, expiresAt: now() + body.expires_in * 1000 };
      return token.value;
    },
  };
}

export type TokenProvider = Pick<ReturnType<typeof createTokenProvider>, "get">;

export interface OpenSkyClientOptions {
  tokens: TokenProvider;
  userAgent: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

export interface BoundingBox {
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
}

export function createOpenSkyClient(opts: OpenSkyClientOptions) {
  const doFetch = opts.fetch ?? fetch;

  async function request(url: string, token: string): Promise<Response> {
    try {
      return await doFetch(url, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": opts.userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (e) {
      const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      throw timedOut
        ? new ProviderError("timeout", `OpenSky did not respond within ${opts.timeoutMs} ms`, undefined, { cause: e })
        : new ProviderError("network", "Could not reach OpenSky", undefined, { cause: e });
    }
  }

  return {
    async fetchStates(box: BoundingBox): Promise<ParsedStates> {
      const q = new URLSearchParams({
        lamin: String(box.lamin),
        lomin: String(box.lomin),
        lamax: String(box.lamax),
        lomax: String(box.lomax),
        extended: "1",
      });
      const url = `${STATES_URL}?${q}`;
      let res = await request(url, await opts.tokens.get());
      if (res.status === 401) res = await request(url, await opts.tokens.get(true)); // expired token

      if (res.status === 429) {
        const retry = Number(res.headers.get("X-Rate-Limit-Retry-After-Seconds"));
        throw new ProviderError("rate_limited", "OpenSky credits used up for now", 429, {
          retryAfterSec: Number.isFinite(retry) ? retry : undefined,
        });
      }
      if (!res.ok) throw new ProviderError("http", `OpenSky returned HTTP ${res.status}`, res.status);

      let body: unknown;
      try {
        body = JSON.parse(await res.text());
      } catch (e) {
        throw new ProviderError("invalid_body", "OpenSky response was not JSON", res.status, { cause: e });
      }
      try {
        return parseStates(body);
      } catch (e) {
        throw new ProviderError("invalid_body", "OpenSky response did not match the schema", res.status, { cause: e });
      }
    },
  };
}

export type OpenSkyClient = ReturnType<typeof createOpenSkyClient>;
