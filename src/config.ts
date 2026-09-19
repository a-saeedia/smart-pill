import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  homeDir: string;
  storeFile: string;
  ledgerFile: string;
  routeModel: string;
  digestModel: string;
  openRouterKey: string | undefined;
}

export function loadConfig(): Config {
  const home = process.env.SMART_PILL_HOME || join(homedir(), ".smart-pill");
  return {
    homeDir: home,
    storeFile: join(home, "store.json"),
    ledgerFile: join(home, "ledger.json"),
    routeModel: process.env.SMART_PILL_ROUTE_MODEL || "anthropic/claude-3.7-sonnet",
    digestModel: process.env.SMART_PILL_DIGEST_MODEL || "anthropic/claude-3.5-haiku",
    openRouterKey: process.env.OPENROUTER_API_KEY || undefined,
  };
}