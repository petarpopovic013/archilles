import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const KEY_PATTERN = /^(uploads|rasters)\/[0-9a-f-]{36}(\.png)?$/;

/**
 * Private files under the data directory, addressed only by generated keys (never user filenames).
 * Keys stay server-side; the browser receives bytes through the API, never paths.
 */
export class PrivateStore {
  constructor(private readonly root: string) {}

  async write(kind: "uploads" | "rasters", bytes: Uint8Array): Promise<string> {
    const key = `${kind}/${randomUUID()}${kind === "rasters" ? ".png" : ""}`;
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, bytes, { flag: "wx", mode: 0o600 });
    return key;
  }

  async read(key: string): Promise<Uint8Array> {
    return new Uint8Array(await fs.readFile(this.resolve(key)));
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  private resolve(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error("INVALID_STORAGE_KEY");
    return path.join(this.root, key);
  }
}
