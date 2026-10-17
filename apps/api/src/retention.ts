import type { Thresholds } from "@aerotrack/shared";
import type { Repo } from "./repo";

// SPEC 11.5: every 30 minutes, delete live positions older than a day.

interface Log {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export class Retention {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly deps: { repo: Pick<Repo, "deletePositionsBefore">; thresholds: Thresholds; nowSec: () => number; log: Log },
  ) {}

  /** Returns how many positions were deleted (0 on failure, which is logged). */
  async runOnce(): Promise<number> {
    const before = this.deps.nowSec() - this.deps.thresholds.retention.keepPositionsSec;
    try {
      const deleted = await this.deps.repo.deletePositionsBefore(before);
      if (deleted) this.deps.log.info({ deleted }, "Deleted old positions");
      return deleted;
    } catch (err) {
      this.deps.log.warn({ err }, "Retention failed; will try again next time");
      return 0;
    }
  }

  start() {
    this.timer ??= setInterval(() => void this.runOnce(), this.deps.thresholds.retention.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
