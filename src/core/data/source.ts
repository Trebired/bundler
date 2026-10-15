import fs from "node:fs/promises";
import path from "node:path";

import type { BundlerDataAsset, BundlerDataSource, BundlerDataSourceResult } from "#3c8d8166992a";

type CollectedSource = {
  assets: BundlerDataAsset[];
  detail: string;
  value: unknown;
};

const DEFAULT_TIMEOUT = 15000;

function isResult(value: unknown): value is BundlerDataSourceResult {
  return Boolean(value) && typeof value === "object" && "value"in(value as Record<string, unknown>);
}

function cachePath(dir: string, name: string): string {
  return path.join(dir, `${name}.json`);
}

async function readCached(dir: string, name: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(cachePath(dir, name), "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

async function writeCached(dir: string, name: string, value: unknown): Promise<number> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await fs.mkdir(path.dirname(cachePath(dir, name)), { recursive: true });
  await fs.writeFile(cachePath(dir, name), serialized, "utf8");
  return Buffer.byteLength(serialized);
}

function describeValue(value: unknown, bytes: number): string {
  const size = `${(bytes / 1024).toFixed(1)}KB`;
  if (Array.isArray(value)) return `${value.length} entries, ${size}`;
  if (value && typeof value === "object") return `${Object.keys(value).length} keys, ${size}`;
  return size;
}

async function requestJson(source: BundlerDataSource): Promise<unknown> {
  const response = await fetch(String(source.url), {
      headers: source.headers,
      signal: AbortSignal.timeout(source.timeout || DEFAULT_TIMEOUT),
  });
  if (!response.ok) throw new Error(`${source.url} responded ${response.status}`);
  return await response.json() as unknown;
}

async function runSource(source: BundlerDataSource, name: string, cached: unknown, dir: string): Promise<unknown> {
  if (typeof source.fetch === "function") return await source.fetch({ cached, dir, name });
  if (source.url) {
    const payload = await requestJson(source);
    return source.map ? await source.map(payload, { cached, dir, name }) : payload;
  }
  throw new Error(`data source ${name} declares neither url nor fetch`);
}

async function collectSource(dir: string, name: string, source: BundlerDataSource): Promise<CollectedSource> {
  const cached = await readCached(dir, name);
  const produced = await runSource(source, name, cached, dir);
  const result = isResult(produced) ? produced : { assets: [], value: produced };
  if (result.value === undefined || result.value === null) throw new Error(`data source ${name} produced nothing`);
  const bytes = await writeCached(dir, name, result.value);
  return {
    assets: result.assets || [],
    detail: result.detail ? `${result.detail}, ${(bytes / 1024).toFixed(1)}KB` : describeValue(result.value, bytes),
    value: result.value,
  };
}

export { collectSource, describeValue, readCached };
