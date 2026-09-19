import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Tiny JSON KV store with atomic writes (tmp + rename, same volume).
 *
 * Concurrency: MCP servers dispatch tool calls in parallel, so read-modify-write
 * must be serialized. We keep a per-file promise queue: write() and update()
 * chain onto it, guaranteeing a caller that awaits its own write never observes
 * or clobbers another caller's in-flight write (same process, same store).
 */
export class KVStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private file: string) {}

  /** Serialize an operation against this store (per-process). */
  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.queue.then(op);
    // Keep the chain alive even if this op rejects; the failure is still
    // delivered to the caller through `run`.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async read(): Promise<Record<string, unknown>> {
    return this.enqueue(async () => {
      try {
        const raw = await readFile(this.file, "utf8");
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    });
  }

  async write(data: Record<string, unknown>): Promise<void> {
    return this.enqueue(() => this.writeNow(data));
  }

  /**
   * Atomic read-modify-write: mutator receives the current data (or {}), returns
   * the new data, and the result is persisted before the next queued op runs.
   * Use this instead of read()+write() to avoid lost updates.
   */
  async update(
    mutator: (data: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.enqueue(async () => {
      const data = await this.readNow();
      const next = mutator(data);
      await this.writeNow(next);
      return next;
    });
  }

  private async readNow(): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private async writeNow(data: Record<string, unknown>): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await rename(tmp, this.file);
  }
}