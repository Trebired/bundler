import path from "node:path";
import { pathToFileURL } from "node:url";

import type { BundlerOptions, LoadedBundlerConfig } from "#3c8d8166992a";
import { pathExists } from "#47cd321d28f1";

function defineConfig<TConfig extends BundlerOptions>(config: TConfig): TConfig {
  return config;
}

async function loadConfigModule(projectRoot: string, configPath: string): Promise<LoadedBundlerConfig> {
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

export { defineConfig, loadConfigModule };
