import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SseHub, formatEvent, type SseClient } from "../src/sse";

const opts = { heartbeatMs: 15000, maxBufferedBytes: 100 };

class FakeClient implements SseClient {
  chunks: string[] = [];
  ended = false;
  writableLength = 0;
  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }
  end() {
    this.ended = true;
  }
  get text() {
    return this.chunks.join("");
  }
}

describe("formatEvent", () => {
  it("writes one SSE message with JSON data", () => {
    expect(formatEvent("status", { feedStatus: "ok" })).toBe('event: status\ndata: {"feedStatus":"ok"}\n\n');
  });
});

describe("SseHub", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("broadcasts to every connected client", () => {
    const hub = new SseHub(opts);
    const a = new FakeClient();
    const b = new FakeClient();
    hub.add(a);
    hub.add(b);
    hub.broadcast("status", { feedStatus: "down" });
    expect(a.text).toBe(formatEvent("status", { feedStatus: "down" }));
    expect(b.text).toBe(a.text);
    expect(hub.size).toBe(2);
  });

  it("sends to one client only", () => {
    const hub = new SseHub(opts);
    const a = new FakeClient();
    const b = new FakeClient();
    hub.add(a);
    hub.add(b);
    hub.send(a, "snapshot", { n: 1 });
    expect(a.chunks).toHaveLength(1);
    expect(b.chunks).toHaveLength(0);
  });

  it("stops sending after a client is removed", () => {
    const hub = new SseHub(opts);
    const a = new FakeClient();
    const remove = hub.add(a);
    remove();
    hub.broadcast("status", {});
    expect(a.chunks).toEqual([]);
    expect(hub.size).toBe(0);
  });

  it("sends a heartbeat comment every heartbeatMs", () => {
    const hub = new SseHub(opts);
    const a = new FakeClient();
    hub.add(a);
    hub.start();
    vi.advanceTimersByTime(opts.heartbeatMs - 1);
    expect(a.chunks).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(a.chunks).toEqual([": heartbeat\n\n"]);
    vi.advanceTimersByTime(opts.heartbeatMs);
    expect(a.chunks).toHaveLength(2);
    hub.stop();
    vi.advanceTimersByTime(opts.heartbeatMs * 3);
    expect(a.chunks).toHaveLength(2);
  });

  it("drops a client that has fallen too far behind", () => {
    const hub = new SseHub(opts);
    const slow = new FakeClient();
    const ok = new FakeClient();
    hub.add(slow);
    hub.add(ok);
    slow.writableLength = opts.maxBufferedBytes + 1;
    hub.broadcast("status", {});
    expect(slow.ended).toBe(true);
    expect(slow.chunks).toEqual([]);
    expect(ok.chunks).toHaveLength(1);
    expect(hub.size).toBe(1);
  });

  it("drops a client whose write throws", () => {
    const hub = new SseHub(opts);
    const broken = new FakeClient();
    broken.write = () => {
      throw new Error("socket closed");
    };
    hub.add(broken);
    expect(() => hub.broadcast("status", {})).not.toThrow();
    expect(hub.size).toBe(0);
  });

  it("closeAll ends every client", () => {
    const hub = new SseHub(opts);
    const a = new FakeClient();
    const b = new FakeClient();
    hub.add(a);
    hub.add(b);
    hub.closeAll();
    expect([a.ended, b.ended]).toEqual([true, true]);
    expect(hub.size).toBe(0);
  });
});
