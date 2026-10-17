import { THRESHOLDS } from "@aerotrack/shared";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env";

const minimal = {
  DATABASE_URL: "postgres://aerotrack:aerotrack@localhost:5433/aerotrack",
  ADSB_USER_AGENT: "AeroTrack/0.1 (+test@example.com)",
};

describe("loadEnv", () => {
  it("applies defaults", () => {
    expect(loadEnv(minimal)).toMatchObject({
      PORT: 8080,
      HOST: "0.0.0.0",
      ADSB_BASE_URL: "https://api.adsb.lol",
      POLL_INTERVAL_MS: THRESHOLDS.poll.intervalMs,
      CORS_ORIGIN: ["http://localhost:3000"],
      LOG_LEVEL: "info",
    });
  });

  it("coerces numbers and splits CORS origins", () => {
    const env = loadEnv({ ...minimal, PORT: "9000", POLL_INTERVAL_MS: "10000", CORS_ORIGIN: "https://a.app, http://localhost:3000" });
    expect(env.PORT).toBe(9000);
    expect(env.POLL_INTERVAL_MS).toBe(10000);
    expect(env.CORS_ORIGIN).toEqual(["https://a.app", "http://localhost:3000"]);
  });

  it("requires a User-Agent and a database", () => {
    expect(() => loadEnv({ DATABASE_URL: minimal.DATABASE_URL })).toThrow(/ADSB_USER_AGENT/);
    expect(() => loadEnv({ ADSB_USER_AGENT: minimal.ADSB_USER_AGENT })).toThrow(/DATABASE_URL/);
  });

  it("refuses to poll adsb.lol faster than every 5 s", () => {
    expect(() => loadEnv({ ...minimal, POLL_INTERVAL_MS: "2000" })).toThrow(/POLL_INTERVAL_MS/);
  });

  it("treats empty optional values as unset", () => {
    expect(loadEnv({ ...minimal, ADMIN_TOKEN: "", ANTHROPIC_API_KEY: "" }).ADMIN_TOKEN).toBeUndefined();
  });
});
