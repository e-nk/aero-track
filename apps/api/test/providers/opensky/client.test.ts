import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "../../../src/providers/errors";
import { createOpenSkyClient, createTokenProvider } from "../../../src/providers/opensky/client";
import { loadOpenSkySample } from "./sample";

const BOX = { lamin: -44, lomin: 112, lamax: -10, lomax: 154 };
const UA = "AeroTrack/0.1 (+test@example.com)";
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function tokenFetch(tokens: string[] = ["t1", "t2", "t3"]) {
  const calls: { url: string; body: string }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body) });
    return json({ access_token: tokens[calls.length - 1], expires_in: 1800 });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe("OpenSky token provider", () => {
  it("exchanges client credentials and caches the token", async () => {
    const t = tokenFetch();
    const tokens = createTokenProvider({ clientId: "id", clientSecret: "s3cret", fetch: t.fn, now: () => 0 });
    expect(await tokens.get()).toBe("t1");
    expect(await tokens.get()).toBe("t1");
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.url).toBe("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token");
    expect(new URLSearchParams(t.calls[0]!.body).get("grant_type")).toBe("client_credentials");
    expect(new URLSearchParams(t.calls[0]!.body).get("client_id")).toBe("id");
  });

  it("refreshes a minute before expiry, or when forced", async () => {
    let now = 0;
    const t = tokenFetch();
    const tokens = createTokenProvider({ clientId: "id", clientSecret: "s", fetch: t.fn, now: () => now });
    await tokens.get();
    now = (1800 - 61) * 1000;
    expect(await tokens.get()).toBe("t1");
    now = (1800 - 59) * 1000;
    expect(await tokens.get()).toBe("t2");
    expect(await tokens.get(true)).toBe("t3");
  });

  it("fails clearly when OpenSky rejects the credentials", async () => {
    const tokens = createTokenProvider({
      clientId: "id",
      clientSecret: "wrong",
      fetch: (async () => json({ error: "invalid_client" }, 401)) as unknown as typeof fetch,
      now: () => 0,
    });
    await expect(tokens.get()).rejects.toThrow(/OpenSky token request failed \(401\)/);
  });
});

describe("OpenSky client", () => {
  const tokens = (values = ["t1", "t2"]) => {
    let i = 0;
    return { get: vi.fn(async (force?: boolean) => (force ? values[++i]! : values[i]!)) };
  };

  it("requests the bounding box with extended data, bearer token and User-Agent", async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), headers: new Headers(init?.headers) });
      return json(loadOpenSkySample());
    }) as unknown as typeof fetch;
    const client = createOpenSkyClient({ tokens: tokens(), fetch: fetchFn, userAgent: UA, timeoutMs: 1000 });
    const parsed = await client.fetchStates(BOX);
    expect(parsed.rows).toHaveLength(63);
    expect(seen[0]!.url).toBe("https://opensky-network.org/api/states/all?lamin=-44&lomin=112&lamax=-10&lomax=154&extended=1");
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer t1");
    expect(seen[0]!.headers.get("user-agent")).toBe(UA);
  });

  it("gets a fresh token and retries once after a 401", async () => {
    const auths: string[] = [];
    const fetchFn = (async (_: unknown, init?: RequestInit) => {
      auths.push(new Headers(init?.headers).get("authorization")!);
      return auths.length === 1 ? new Response("", { status: 401 }) : json(loadOpenSkySample());
    }) as unknown as typeof fetch;
    const t = tokens();
    await createOpenSkyClient({ tokens: t, fetch: fetchFn, userAgent: UA, timeoutMs: 1000 }).fetchStates(BOX);
    expect(auths).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("reports running out of credits as rate_limited with the retry time", async () => {
    const fetchFn = (async () => new Response("", { status: 429, headers: { "X-Rate-Limit-Retry-After-Seconds": "3600" } })) as unknown as typeof fetch;
    const err = await createOpenSkyClient({ tokens: tokens(), fetch: fetchFn, userAgent: UA, timeoutMs: 1000 })
      .fetchStates(BOX)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ kind: "rate_limited", status: 429, retryAfterSec: 3600 });
  });

  it("reports a body that isn't valid states data as invalid_body", async () => {
    const fetchFn = (async () => json({ hello: 1 })) as unknown as typeof fetch;
    const err = await createOpenSkyClient({ tokens: tokens(), fetch: fetchFn, userAgent: UA, timeoutMs: 1000 })
      .fetchStates(BOX)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "invalid_body" });
  });
});
