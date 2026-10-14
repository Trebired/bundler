import fs from "node:fs/promises";
import path from "node:path";

import type {
  BundlerDataAsset,
  BundlerDataSyncOptions,
  BundlerDataSyncResult,
  BundlerProjectDataConfig,
} from "#3c8d8166992a";
import { resolveLogger } from "#dcx0jw9bw3ka";
import { loadConfig } from "#z1hxysbp7ydt";
import { collectSource, readCached } from "./source.js";

const DEFAULT_DEFINE = "BUNDLER_DATA";
const DEFAULT_DIR = "dist/data";

function dataConfigOf(config: BundlerProjectDataConfig | undefined): Required<BundlerProjectDataConfig> {
  return {
    define: config?.define || DEFAULT_DEFINE,
    dir: config?.dir || DEFAULT_DIR,
    sources: config?.sources || {},
  };
}

async function writeDataAssets(outDir: string, assets: BundlerDataAsset[]): Promise<number> {
  let written = 0;
  for (const asset of assets) {
    const target = path.join(outDir, asset.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, asset.contents as Parameters<typeof fs.writeFile>[1]);
    written += 1;
  }
  return written;
}

async function syncBundlerData(options: BundlerDataSyncOptions = {}): Promise<BundlerDataSyncResult> {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const loaded = await loadConfig(rootDir);
  const config = dataConfigOf(options.data || loaded.config.data);
  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const dir = path.resolve(rootDir, config.dir);
  const assets: BundlerDataAsset[] = [];
  const data: Record<string, unknown> = {};
  const kept: string[] = [];

  for (const [name, source] of Object.entries(config.sources)) {
    try {
      const collected = await collectSource(dir, name, source);
      data[name] = collected.value;
      assets.push(...collected.assets);
    } catch (error) {
      const cached = await readCached(dir, name);
      const reason = error instanceof Error ? error.message : String(error);
      if (cached === undefined) {
        logger.warn("data", `${name} reached nothing and nothing is kept :: ${reason}`);
        continue;
      }
      data[name] = cached;
      kept.push(name);
      logger.warn("data", `${name} reached nothing, keeping what the last build wrote :: ${reason}`);
    }
  }

  const names = Object.keys(data);
  const detail = kept.length > 0 ? `, ${kept.length} kept from the last build` : "";
  logger.info("data", `collected ${names.length} of ${Object.keys(config.sources).length} sources${detail}`);

  return {
    assets,
    data,
    define: {[config.define]: JSON.stringify(data) },
    defineName: config.define,
    dir,
  };
}

export { syncBundlerData, writeDataAssets };
