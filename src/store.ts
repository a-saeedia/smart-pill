import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Tiny JSON KV store with atomic writes (tmp + rename, same volume). */
export class KVStore {
  constructor(private file: string) {}

  async read(): Promise<Record<string, unknown>> {
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

  async write(data: Record<string, unknown>): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await rename(tmp, this.file);
  }
}