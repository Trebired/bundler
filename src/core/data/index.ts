import fs from "node:fs/promises";
import path from "node:path";

import type {
  BundlerDataAsset,
  BundlerDataSyncOptions,
  BundlerDataSyncResult,
  BundlerDataWriteAssetsOptions,
  BundlerProjectDataConfig,
} from "#3c8d8166992a";
import { resolveLogger } from "#dcx0jw9bw3ka";
import { loadConfig } from "#z1hxysbp7ydt";
import { collectSource, readCached } from "./source.js";

type SyncLogger = ReturnType<typeof resolveLogger>;

type SyncTotals = { assets: number; fetched: number; kept: number; missing: number };

const DEFAULT_DEFINE = "BUNDLER_DATA";
const DEFAULT_DIR = "dist/data";

function dataConfigOf(config: BundlerProjectDataConfig | undefined): Required<BundlerProjectDataConfig> {
  return {
    define: config?.define || DEFAULT_DEFINE,
    dir: config?.dir || DEFAULT_DIR,
    sources: config?.sources || {},
  };
}

function assetBytes(assets: BundlerDataAsset[]): number {
  return assets.reduce((total, asset) => total + byteLengthOf(asset.contents), 0);
}

function byteLengthOf(contents: BundlerDataAsset["contents"]): number {
  if (typeof contents === "string") return Buffer.byteLength(contents);
  if (contents instanceof ArrayBuffer) return contents.byteLength;
  return contents.byteLength;
}

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function collectOne(
  dir: string,
  name: string,
  source: BundlerProjectDataConfig["sources"][string],
  logger: SyncLogger,
  totals: SyncTotals,
): Promise<{assets:BundlerDataAsset[];value:unknown}|null> {
  try {
    const collected = await collectSource(dir, name, source);
    totals.fetched += 1;
    totals.assets += collected.assets.length;
    const assets = collected.assets.length > 0 ? `, ${collected.assets.length} assets` : "";
    logger.info("data", `${name} :: fetched ${collected.detail}${assets}`);
    return { assets: collected.assets, value: collected.value };
  } catch (error) {
    const cached = await readCached(dir, name);
    if (cached === undefined) {
      totals.missing += 1;
      logger.warn("data", `${name} :: reached nothing and nothing is kept :: ${failureReason(error)}`);
      return null;
    }
    totals.kept += 1;
    logger.warn("data", `${name} :: kept what the last build wrote :: ${failureReason(error)}`);
    return { assets: [], value: cached };
  }
}

async function syncBundlerData(options: BundlerDataSyncOptions = {}): Promise<BundlerDataSyncResult> {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const loaded = await loadConfig(rootDir);
  const config = dataConfigOf(options.data || loaded.config.data);
  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const dir = path.resolve(rootDir, config.dir);
  const names = Object.keys(config.sources);
  const totals: SyncTotals = { assets: 0, fetched: 0, kept: 0, missing: 0 };
  const assets: BundlerDataAsset[] = [];
  const data: Record<string, unknown> = {};

  if (names.length === 0) {
    return { assets, data, define: {[config.define]: "{}" }, defineName: config.define, dir };
  }

  logger.info("data", `start :: sources=${names.length} dir=${path.relative(rootDir, dir) || dir}`);
  const startedAt = Date.now();

  const collected = await Promise.all(names.map((name) => collectOne(dir, name, config.sources[name] as never, logger, totals)));
  names.forEach((name, index) => {
      const entry = collected[index];
      if (!entry) return;
      data[name] = entry.value;
      assets.push(...entry.assets);
  });

  const define = JSON.stringify(data);
  const perSource = Object.fromEntries(Object.entries(data).map(([name, value]) => [`${config.define}.${name}`, JSON.stringify(value)]));
  logger.info(
    "data",
    `complete :: fetched=${totals.fetched} kept=${totals.kept} missing=${totals.missing}`
    +` assets=${totals.assets} define=${config.define} size=${(Buffer.byteLength(define) / 1024).toFixed(1)}KB`
    +` in ${Date.now() - startedAt}ms`,
  );

  return { assets, data, define: { ...perSource, [config.define]: define }, defineName: config.define, dir };
}

async function writeDataAssets(
  outDir: string,
  assets: BundlerDataAsset[],
  options: BundlerDataWriteAssetsOptions = {},
): Promise<number> {
  let written = 0;
  for (const asset of assets) {
    const target = path.join(outDir, asset.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, asset.contents as Parameters<typeof fs.writeFile>[1]);
    written += 1;
  }
  if (written > 0 && (options.logger || options.loggerAdapter)) {
    const logger = resolveLogger(options.logger, options.loggerAdapter);
    const size = (assetBytes(assets) / 1024).toFixed(1);
    logger.info("data", `assets :: wrote ${written} files, ${size}KB into ${outDir}`);
  }
  return written;
}

export { syncBundlerData, writeDataAssets };
export { fetchRepoFiles, githubReleaseSource, githubReposSource } from "./github_sources.js";
