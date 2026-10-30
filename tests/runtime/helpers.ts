import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RuntimeConfig } from "../../runtime/config";

/** Isolated runtime config: loopback, ephemeral port, throwaway data directory. */
export function testConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "archilles-test-"));
  return {
    host: "127.0.0.1",
    port: 0,
    dataDir,
    databasePath: path.join(dataDir, "archilles.sqlite"),
    uploadsDir: path.join(dataDir, "uploads"),
    aiBudgetUsd: 1,
    reviewModel: "claude-haiku-4-5",
    ...overrides,
  };
}

export function removeDataDir(config: RuntimeConfig): void {
  fs.rmSync(config.dataDir, { recursive: true, force: true });
}

export async function call(baseUrl: string, method: string, route: string, body?: unknown) {
  const response = await fetch(new URL(route, baseUrl), {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
