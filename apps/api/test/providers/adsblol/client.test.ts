import { describe, expect, it } from "vitest";
import { ProviderError, createAdsbLolClient } from "../../../src/providers/adsblol/client";
import { loadSample } from "./sample";

const UA = "AeroTrack/0.1 (+test@example.com)";
const RATE_LIMIT_HTML =
  "<html>\r\n<head><title>429 Too Many Requests</title></head>\r\n<body>\r\n<center><h1>429 Too Many Requests</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>\r\n";

interface Call {
  url: string;
  headers: Headers;
}

function fakeFetch(respond: () => Response | Promise<Response>, calls: Call[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return respond();
  }) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const client = (fetchImpl: typeof fetch, timeoutMs = 5000) =>
  createAdsbLolClient({ baseUrl: "https://api.adsb.lol", userAgent: UA, timeoutMs, fetch: fetchImpl });

const POINT = { lat: -33.9, lon: 151.0, radiusNm: 60 };

async function failure(p: Promise<unknown>): Promise<ProviderError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ProviderError) return e;
    throw e;
  }
  throw new Error("expected a ProviderError");
}

describe("adsb.lol client", () => {
  it("requests the point endpoint with a User-Agent", async () => {
    const calls: Call[] = [];
    await client(fakeFetch(() => json(loadSample()), calls)).fetchPoint(POINT);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.adsb.lol/v2/point/-33.9/151/60");
    expect(calls[0]!.headers.get("user-agent")).toBe(UA);
  });

  it("returns the parsed response", async () => {
    const res = await client(fakeFetch(() => json(loadSample()))).fetchPoint(POINT);
    expect(res.aircraft).toHaveLength(25);
    expect(res.now).toBe(1792219219500);
  });

  it("looks up several aircraft in one request", async () => {
    const calls: Call[] = [];
    await client(fakeFetch(() => json(loadSample()), calls)).fetchHexes(["7cb05c", "~2a0b1c", "c827f0"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.adsb.lol/v2/hex/7cb05c,~2a0b1c,c827f0");
    expect(calls[0]!.headers.get("user-agent")).toBe(UA);
  });

  it("refuses to start without a User-Agent", () => {
    expect(() => createAdsbLolClient({ baseUrl: "https://api.adsb.lol", userAgent: " " })).toThrow();
  });

  it("reports a 429 HTML page as rate_limited", async () => {
    const res = () => new Response(RATE_LIMIT_HTML, { status: 429, headers: { "content-type": "text/html" } });
    const err = await failure(client(fakeFetch(res)).fetchPoint(POINT));
    expect(err.kind).toBe("rate_limited");
    expect(err.status).toBe(429);
  });

  it("reports other non-2xx responses as http errors", async () => {
    const err = await failure(client(fakeFetch(() => new Response("oops", { status: 503 }))).fetchPoint(POINT));
    expect(err.kind).toBe("http");
    expect(err.status).toBe(503);
  });

  it("reports a 200 that isn't JSON as invalid_body", async () => {
    const res = () => new Response("<html>maintenance</html>", { status: 200, headers: { "content-type": "text/html" } });
    expect((await failure(client(fakeFetch(res)).fetchPoint(POINT))).kind).toBe("invalid_body");
  });

  it("reports JSON that fails the schema as invalid_body", async () => {
    expect((await failure(client(fakeFetch(() => json({ hello: "world" }))).fetchPoint(POINT))).kind).toBe(
      "invalid_body",
    );
  });

  it("reports network failures", async () => {
    const boom = fakeFetch(() => Promise.reject(new TypeError("fetch failed")));
    expect((await failure(client(boom).fetchPoint(POINT))).kind).toBe("network");
  });

  it("times out a slow response", async () => {
    const slow = ((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      })) as typeof fetch;
    expect((await failure(client(slow, 20).fetchPoint(POINT))).kind).toBe("timeout");
  });
});
