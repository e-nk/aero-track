// Server-sent events client registry and broadcast (SPEC 11.8).

export interface SseClient {
  write(chunk: string): boolean;
  end(): void;
  /** Bytes queued but not yet sent. */
  readonly writableLength: number;
}

export interface SseHubOptions {
  heartbeatMs: number;
  maxBufferedBytes: number;
}

export const formatEvent = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const HEARTBEAT = ": heartbeat\n\n";

export class SseHub {
  private readonly clients = new Set<SseClient>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly opts: SseHubOptions) {}

  get size(): number {
    return this.clients.size;
  }

  /** Register a client. Returns a function that removes it. */
  add(client: SseClient): () => void {
    this.clients.add(client);
    return () => this.clients.delete(client);
  }

  send(client: SseClient, event: string, data: unknown): void {
    this.write(client, formatEvent(event, data));
  }

  broadcast(event: string, data: unknown): void {
    const chunk = formatEvent(event, data);
    for (const c of this.clients) this.write(c, chunk);
  }

  start(): void {
    this.timer ??= setInterval(() => {
      for (const c of this.clients) this.write(c, HEARTBEAT);
    }, this.opts.heartbeatMs);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  closeAll(): void {
    for (const c of this.clients) this.drop(c);
  }

  private write(client: SseClient, chunk: string): void {
    // A client this far behind is not reading; drop it rather than buffer forever.
    if (client.writableLength > this.opts.maxBufferedBytes) return this.drop(client);
    try {
      client.write(chunk);
    } catch {
      this.drop(client);
    }
  }

  private drop(client: SseClient): void {
    this.clients.delete(client);
    try {
      client.end();
    } catch {
      // already closed
    }
  }
}
