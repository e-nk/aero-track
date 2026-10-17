import { THRESHOLDS } from "@aerotrack/shared";
import { z } from "zod";

// Empty strings in .env files mean "not set".
const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  ADSB_BASE_URL: z.url().default("https://api.adsb.lol"),
  ADSB_USER_AGENT: z.string().trim().min(1),
  ADSB_API_KEY: optional, // not required as of 2026-10-17
  // One shared poll; never faster than every 5 s (SPEC 5.1).
  POLL_INTERVAL_MS: z.coerce.number().int().min(5000).default(THRESHOLDS.poll.intervalMs),
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:3000")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  ADMIN_TOKEN: optional,
  R2_ACCOUNT_ID: optional,
  R2_ACCESS_KEY_ID: optional,
  R2_SECRET_ACCESS_KEY: optional,
  R2_BUCKET: optional,
  R2_PUBLIC_BASE_URL: optional,
  // OpenSky API client for the Australia-wide overview (SPEC 5.8). Both or neither.
  OPENSKY_CLIENT_ID: optional,
  OPENSKY_CLIENT_SECRET: optional,
  ANTHROPIC_API_KEY: optional,
}).superRefine((env, ctx) => {
  if (!!env.OPENSKY_CLIENT_ID !== !!env.OPENSKY_CLIENT_SECRET) {
    const missing = env.OPENSKY_CLIENT_ID ? "OPENSKY_CLIENT_SECRET" : "OPENSKY_CLIENT_ID";
    ctx.addIssue({ code: "custom", path: [missing], message: "set both OpenSky values, or neither" });
  }
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return result.data;
}

/** Load apps/api/.env when present (local dev). Real env vars win. */
export function loadDotEnv(path = ".env"): void {
  try {
    process.loadEnvFile(path);
  } catch {
    // No .env file: rely on the real environment (e.g. Railway).
  }
}
