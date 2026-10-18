import type { Alert } from "./alerts";

// System notifications for alerts, while AeroTrack is open. Every call is failure-proof:
// unsupported browsers, denied permission and constructors that throw (Chrome on Android
// only allows service-worker notifications) all mean "in-page alerts only".

interface NotificationApi {
  permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  new (title: string, options?: NotificationOptions): Notification;
}

function api(): NotificationApi | null {
  const N = (globalThis as { Notification?: unknown }).Notification;
  return typeof N === "function" ? (N as NotificationApi) : null;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return api()?.permission ?? "unsupported";
}

export async function requestNotifications(): Promise<NotificationPermission | "unsupported"> {
  const N = api();
  if (!N) return "unsupported";
  try {
    return await N.requestPermission();
  } catch {
    return "denied";
  }
}

/** True when a notification was shown. The tag stops the same alert showing twice. */
export function showNotification(alert: Alert, onClick: () => void): boolean {
  const N = api();
  if (!N || N.permission !== "granted") return false;
  try {
    // Outside the page there is no mode badge: say so in the title (rule 3).
    const title = alert.mode === "live" ? alert.title : `Recorded: ${alert.title}`;
    const n = new N(title, { body: alert.body, tag: alert.id });
    n.onclick = () => {
      globalThis.focus?.();
      onClick();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
