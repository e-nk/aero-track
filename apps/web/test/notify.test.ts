import { afterEach, describe, expect, it, vi } from "vitest";
import type { Alert } from "../lib/alerts";
import { notificationPermission, requestNotifications, showNotification } from "../lib/notify";

const alert: Alert = { id: "e1:open", eventId: "e1", hex: "7c6db7", kind: "landing", title: "QFA520 landed", body: "b", at: 0, mode: "live" };

function fakeNotification(permission: NotificationPermission, opts: { throws?: boolean } = {}) {
  const created: { title: string; options?: NotificationOptions }[] = [];
  class FakeNotification {
    static permission = permission;
    static requestPermission = vi.fn(async () => "granted" as NotificationPermission);
    onclick: (() => void) | null = null;
    constructor(title: string, options?: NotificationOptions) {
      if (opts.throws) throw new TypeError("Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.");
      created.push({ title, options });
    }
    close() {}
  }
  vi.stubGlobal("Notification", FakeNotification);
  return { created, FakeNotification };
}

afterEach(() => vi.unstubAllGlobals());

describe("notify", () => {
  it("reports unsupported when there is no Notification API", () => {
    vi.stubGlobal("Notification", undefined);
    expect(notificationPermission()).toBe("unsupported");
    expect(showNotification(alert, () => {})).toBe(false);
  });

  it("shows one notification tagged with the alert id when granted", () => {
    const { created } = fakeNotification("granted");
    expect(showNotification(alert, () => {})).toBe(true);
    expect(created).toEqual([{ title: "QFA520 landed", options: { body: "b", tag: "e1:open" } }]);
  });

  it("does nothing without permission", () => {
    const { created } = fakeNotification("default");
    expect(showNotification(alert, () => {})).toBe(false);
    expect(created).toEqual([]);
  });

  it("returns false instead of throwing where the constructor isn't allowed (Chrome on Android)", () => {
    fakeNotification("granted", { throws: true });
    expect(showNotification(alert, () => {})).toBe(false);
  });

  it("asks for permission", async () => {
    fakeNotification("default");
    expect(await requestNotifications()).toBe("granted");
  });
});

describe("notify: recorded alerts", () => {
  it("marks a recorded alert's notification so it can't pass for live news", () => {
    const { created } = fakeNotification("granted");
    showNotification({ ...alert, mode: "recorded" }, () => {});
    expect(created[0]!.title).toBe("Recorded: QFA520 landed");
  });
});
