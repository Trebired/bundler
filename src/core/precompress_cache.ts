import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CACHE_SEGMENTS = ["node_modules", ".cache", "@trebired", "bundler", "precompress"];
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type PrecompressCache = {
  read: (key: string) => Promise<Buffer|null>;
  write: (key: string, contents: Buffer) => Promise<void>;
};

function precompressCacheDir(rootDir: string): string {
  return path.join(path.resolve(rootDir), ...CACHE_SEGMENTS);
}

function precompressKey(content: Buffer, variant: string): string {
  return `${createHash("sha256").update(content).digest("hex")}-${variant}`;
}

function openPrecompressCache(dir: string): PrecompressCache {
  return {
    read: async(key) => {
      const file = path.join(dir, key);
      const contents = await fs.readFile(file).catch (() => null);
      if (contents) await fs.utimes(file, new Date(), new Date()).catch (() => undefined);
      return contents;
    },
    write: async(key, contents) => {
      await fs.mkdir(dir, { recursive: true });
      const temporary = path.join(dir, `${key}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
      await fs.writeFile(temporary, contents);
      await fs.rename(temporary, path.join(dir, key)).catch (() => fs.rm(temporary, { force: true }));
    },
  };
}

async function prunePrecompressCache(dir: string, now = Date.now()): Promise<void> {
  const entries = await fs.readdir(dir).catch (() => [] as string[]);
  await Promise.all(entries.map(async(entry) => {
        const file = path.join(dir, entry);
        const stats = await fs.stat(file).catch (() => null);
        if (stats && now - stats.mtimeMs > MAX_AGE_MS) await fs.rm(file, { force: true });
  }));
}

function workerCount(): number {
  const available = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(16, available));
}

async function runLimited<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lane = async() => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

export { openPrecompressCache, precompressCacheDir, precompressKey, prunePrecompressCache, runLimited, workerCount };
export type { PrecompressCache };
