// Errors shared by every provider client (adsb.lol, OpenSky).

export type ProviderErrorKind = "network" | "timeout" | "rate_limited" | "http" | "invalid_body";

export class ProviderError extends Error {
  readonly retryAfterSec: number | undefined;

  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
    options?: { cause?: unknown; retryAfterSec?: number },
  ) {
    super(message, options);
    this.name = "ProviderError";
    this.retryAfterSec = options?.retryAfterSec;
  }
}
