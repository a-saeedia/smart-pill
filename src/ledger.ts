import { KVStore } from "./store.js";

export interface LedgerEvent {
  ts: string;
  tool: string;
  inputTokens: number;
  savedTokens: number;
  note: string;
}

/** Persistent token-savings ledger: "tokens you didn't waste". */
export class Ledger {
  constructor(private store: KVStore) {}

  async add(ev: Omit<LedgerEvent, "ts">): Promise<LedgerEvent> {
    const data = await this.store.read();
    const raw = data.events;
    const events: LedgerEvent[] = Array.isArray(raw) ? (raw as LedgerEvent[]) : [];
    const full: LedgerEvent = { ...ev, ts: new Date().toISOString() };
    events.push(full);
    data.events = events.slice(-200);
    const prev = typeof data.totalSavedTokens === "number" ? data.totalSavedTokens : 0;
    data.totalSavedTokens = prev + ev.savedTokens;
    await this.store.write(data);
    return full;
  }

  async report(): Promise<{ events: LedgerEvent[]; totalSavedTokens: number }> {
    const data = await this.store.read();
    return {
      events: Array.isArray(data.events) ? (data.events as LedgerEvent[]) : [],
      totalSavedTokens: typeof data.totalSavedTokens === "number" ? data.totalSavedTokens : 0,
    };
  }
}