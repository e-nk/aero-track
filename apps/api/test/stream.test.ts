import http from "node:http";
import type { AddressInfo } from "node:net";
import { EventLifecycle } from "@aerotrack/detectors";
import { THRESHOLDS } from "@aerotrack/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { AircraftStore } from "../src/buffer";
import { SightingTracker } from "../src/sightings";
import { SseHub } from "../src/sse";
import { FakeRepo } from "./fakeRepo";
import { T0, obs, state } from "./helpers";

interface Parsed {
  event: string;
  data: unknown;
}

/** Opens /api/stream and collects parsed SSE messages. */
function connect(port: number, origin = "http://localhost:3000") {
  const messages: Parsed[] = [];
  let buffer = "";
  let res!: http.IncomingMessage;
  const ready = new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = http.get({ port, path: "/api/stream", headers: { origin } }, (r) => {
      res = r;
      r.setEncoding("utf8");
      r.on("data", (chunk: string) => {
        buffer += chunk;
        let i: number;
        while ((i = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, i);
          buffer = buffer.slice(i + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (event && data) messages.push({ event, data: JSON.parse(data) });
        }
      });
      resolve(r);
    });
    req.on("error", reject);
  });
  const waitFor = async (n: number) => {
    for (let i = 0; i < 200 && messages.length < n; i++) await new Promise((r) => setTimeout(r, 10));
    return messages;
  };
  return { ready, waitFor, messages, close: () => res?.destroy() };
}

let cleanup: (() => Promise<unknown>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function start() {
  const store = new AircraftStore(THRESHOLDS);
  store.ingest([state("7c0001", obs(T0))]);
  const hub = new SseHub(THRESHOLDS.sse);
  const app = buildApp({
    store,
    lifecycle: new EventLifecycle({ thresholds: THRESHOLDS, mode: "live", newId: () => "ev" }),
    repo: new FakeRepo(),
    hub,
    sightings: new SightingTracker({ keepSec: THRESHOLDS.buffer.keepSec, newId: () => "s" }),
    status: () => ({ feedStatus: "ok", lastPollAt: T0 * 1000, consecutiveFailures: 0 }),
    nowSec: () => T0,
    corsOrigin: ["http://localhost:3000"],
    logger: false,
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  cleanup = () => app.close();
  return { app, hub, port: (app.server.address() as AddressInfo).port };
}

describe("GET /api/stream", () => {
  it("sends SSE headers with CORS for the allowed origin", async () => {
    const { port } = await start();
    const c = connect(port);
    const res = await c.ready;
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    c.close();
  });

  it("sends a snapshot and the feed status on connect", async () => {
    const { port } = await start();
    const c = connect(port);
    const [snapshot, status] = await c.waitFor(2);
    expect(snapshot).toMatchObject({ event: "snapshot", data: { now: T0, mode: "live", feedStatus: "ok" } });
    expect((snapshot!.data as { aircraft: unknown[][] }).aircraft.map((a) => a[0])).toEqual(["7c0001"]);
    expect(status).toEqual({ event: "status", data: { feedStatus: "ok", lastPollAt: T0 * 1000 } });
    c.close();
  });

  it("delivers broadcasts to connected clients", async () => {
    const { port, hub } = await start();
    const a = connect(port);
    const b = connect(port);
    await a.waitFor(2);
    await b.waitFor(2);
    hub.broadcast("event_close", { id: "ev", hex: "7c0001", closedAt: T0 });
    expect((await a.waitFor(3))[2]).toEqual({ event: "event_close", data: { id: "ev", hex: "7c0001", closedAt: T0 } });
    expect((await b.waitFor(3))[2]!.event).toBe("event_close");
    a.close();
    b.close();
  });

  it("forgets a client that disconnects", async () => {
    const { port, hub } = await start();
    const c = connect(port);
    await c.waitFor(2);
    expect(hub.size).toBe(1);
    c.close();
    for (let i = 0; i < 100 && hub.size > 0; i++) await new Promise((r) => setTimeout(r, 10));
    expect(hub.size).toBe(0);
  });

  it("closing the app ends open streams instead of hanging", async () => {
    const { app, port, hub } = await start();
    const c = connect(port);
    await c.waitFor(2);
    const res = await c.ready;
    const ended = new Promise((r) => res.on("end", r));
    await app.close();
    cleanup = undefined;
    await ended;
    expect(hub.size).toBe(0);
  });
});
