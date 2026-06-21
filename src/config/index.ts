import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { BundlerOptions, LoadedBundlerConfig } from "#jb343639kom2";

function defineBundlerConfig(config: BundlerOptions): BundlerOptions {
  return config;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadBundlerConfigModule(projectRoot: string, configPath: string): Promise<LoadedBundlerConfig> {
  const resolvedPath = path.resolve(projectRoot, configPath);

  if (!await pathExists(resolvedPath)) {
    throw new Error(`Config module was not found: ${resolvedPath}`);
  }

  const imported = await import(pathToFileURL(resolvedPath).href);
  const config = imported.default as unknown;

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Config module must default-export a config object");
  }

  return {
    config: config as BundlerOptions,
    configPath: resolvedPath,
  };
}

export { defineBundlerConfig, loadBundlerConfigModule };
