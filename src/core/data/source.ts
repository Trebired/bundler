import fs from "node:fs/promises";
import path from "node:path";

import type { BundlerDataAsset, BundlerDataSource, BundlerDataSourceResult } from "#3c8d8166992a";

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

async function writeCached(dir: string, name: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(cachePath(dir, name)), { recursive: true });
  await fs.writeFile(cachePath(dir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function requestJson(source: BundlerDataSource): Promise<unknown> {
  const response = await fetch(String(source.url), {
      headers: source.headers,
      signal: AbortSignal.timeout(source.timeout || DEFAULT_TIMEOUT),
  });
  if (!response.ok) throw new Error(`${source.url} responded ${response.status}`);
  return await response.json() as unknown;
}

async function runSource(source: BundlerDataSource, name: string, cached: unknown): Promise<unknown> {
  if (typeof source.fetch === "function") return await source.fetch({ cached, name });
  if (source.url) {
    const payload = await requestJson(source);
    return source.map ? await source.map(payload, { cached, name }) : payload;
  }
  throw new Error(`data source ${name} declares neither url nor fetch`);
}

async function collectSource(
  dir: string,
  name: string,
  source: BundlerDataSource,
): Promise<{assets:BundlerDataAsset[];cached:boolean;value:unknown}> {
  const cached = await readCached(dir, name);
  const produced = await runSource(source, name, cached);
  const result = isResult(produced) ? produced : { assets: [], value: produced };
  if (result.value === undefined || result.value === null) throw new Error(`data source ${name} produced nothing`);
  await writeCached(dir, name, result.value);
  return { assets: result.assets || [], cached: false, value: result.value };
}

export { collectSource, readCached };
