import { parseRecording, type RecordingFile, type RecordingMeta } from "@aerotrack/shared";
import { API_URL, OFFLINE } from "./config";

// Recordings come from the api (Postgres) when it's reachable, otherwise from
// the offline copies in public/recordings (SPEC 8, 13). Always validated.

export interface LoadOptions {
  fetch?: typeof fetch;
  offline?: boolean;
}

async function getJson(doFetch: typeof fetch, url: string): Promise<unknown | null> {
  try {
    const res = await doFetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function loadRecordingList(
  opts: LoadOptions = {},
): Promise<{ source: "api" | "offline"; recordings: RecordingMeta[] }> {
  const doFetch = opts.fetch ?? fetch;
  if (!(opts.offline ?? OFFLINE)) {
    const fromApi = await getJson(doFetch, `${API_URL}/api/recordings`);
    if (Array.isArray(fromApi)) return { source: "api", recordings: fromApi as RecordingMeta[] };
  }
  const offline = await getJson(doFetch, "/recordings/index.json");
  return { source: "offline", recordings: Array.isArray(offline) ? (offline as RecordingMeta[]) : [] };
}

export async function loadRecording(id: string, opts: LoadOptions = {}): Promise<RecordingFile | null> {
  const doFetch = opts.fetch ?? fetch;
  const urls = [
    ...((opts.offline ?? OFFLINE) ? [] : [`${API_URL}/api/recordings/${encodeURIComponent(id)}`]),
    `/recordings/${encodeURIComponent(id)}.json`,
  ];
  for (const url of urls) {
    const body = await getJson(doFetch, url);
    if (body === null) continue;
    try {
      return parseRecording(body);
    } catch {
      return null; // never replay something that isn't a valid recording
    }
  }
  return null;
}
