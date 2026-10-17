import type { BehaviourEvent, Thresholds } from "@aerotrack/shared";

// Followed flights (SPEC 11.11). Shared by every viewer, capped, in memory.

export interface FollowEntry {
  hex: string;
  addedAt: number; // epoch seconds
  landedAt: number | null; // observed landing, if any
}

export type AddResult = "added" | "exists" | "full" | "invalid";

const HEX = /^~?[0-9a-f]{6}$/;

export class FollowList {
  private readonly entries = new Map<string, FollowEntry>();

  constructor(
    private readonly opts: Thresholds["follow"],
    /** Follows saved before a restart. */
    seed: FollowEntry[] = [],
  ) {
    for (const e of seed) this.entries.set(e.hex, { ...e });
  }

  get max(): number {
    return this.opts.maxFollowed;
  }

  add(rawHex: string, now: number): AddResult {
    const hex = rawHex.toLowerCase();
    if (!HEX.test(hex)) return "invalid";
    if (this.entries.has(hex)) return "exists";
    if (this.entries.size >= this.opts.maxFollowed) return "full";
    this.entries.set(hex, { hex, addedAt: now, landedAt: null });
    return "added";
  }

  remove(hex: string): boolean {
    return this.entries.delete(hex.toLowerCase());
  }

  has(hex: string): boolean {
    return this.entries.has(hex);
  }

  hexes(): string[] {
    return [...this.entries.keys()];
  }

  list(): FollowEntry[] {
    return [...this.entries.values()];
  }

  /** Record observed landings. Returns true if anything changed. */
  applyEvents(events: BehaviourEvent[]): boolean {
    let changed = false;
    for (const e of events) {
      const entry = this.entries.get(e.hex);
      const at = e.evidence.at;
      if (e.type !== "landing" || !entry || typeof at !== "number" || entry.landedAt === at) continue;
      entry.landedAt = at;
      changed = true;
    }
    return changed;
  }

  /** Stop following afterLandingSec after a landing, or after maxAgeSec. Returns removed hexes. */
  expire(now: number): string[] {
    const removed: string[] = [];
    for (const [hex, e] of this.entries) {
      const landedLongAgo = e.landedAt !== null && now - e.landedAt > this.opts.afterLandingSec;
      if (landedLongAgo || now - e.addedAt > this.opts.maxAgeSec) {
        this.entries.delete(hex);
        removed.push(hex);
      }
    }
    return removed;
  }
}
