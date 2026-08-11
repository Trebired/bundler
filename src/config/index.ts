import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  BundlerNamespace,
  BundlerOptions,
  BundlerProjectConfig,
  LoadedBundlerConfig,
  LoadedBundlerProjectConfig,
  NormalizedBundlerProjectConfig,
} from "#3c8d8166992a";
import { PACKAGE_WORKSPACE_CONFIG_DIR } from "#m7884285ke1w";
import { pathExists } from "#47cd321d28f1";

type LoadBundlerProjectConfigOptions = {
  configPath?: string;
  defaultIfMissing?: boolean;
  searchFrom?: string;
};

const BUNDLER_PROJECT_CONFIG_PATH = `${PACKAGE_WORKSPACE_CONFIG_DIR}/bundler/config.ts`;

function createConfigDefiner<T>(): (config: T) => T {
  return (config) => config;
}

const defineBundlerConfig = createConfigDefiner<BundlerOptions>();
const defineBundlerProjectConfig = createConfigDefiner<BundlerProjectConfig>();

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

function normalizeBundlerPrefix(value: unknown, label = "prefix"): string {
  if (value === false || value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error(`${label} must be a string or false`);
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.startsWith(".") ? trimmed.slice(1) : trimmed;
  if (!/^[a-z][a-z0-9_-]*$/iu.test(normalized)) {
    throw new Error(`${label} must start with a letter and contain only letters, numbers, underscores, or hyphens`);
  }
  return normalized;
}

function normalizeBundlerProjectConfig(config: unknown = {}): NormalizedBundlerProjectConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Bundler project config must be an object");
  }
  const source = config as BundlerProjectConfig;
  return {
    prefix: normalizeBundlerPrefix(source.prefix),
  };
}

function prefixedName(prefix: string, name: string): string {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) throw new Error("namespace name must be a non-empty string");
  return prefix ? `${prefix}-${normalizedName}` : normalizedName;
}

function createBundlerNamespace(config: BundlerProjectConfig | NormalizedBundlerProjectConfig = {}): BundlerNamespace {
  const prefix = normalizeBundlerPrefix(config.prefix);
  return {
    className(name: string) {
      return prefixedName(prefix, name);
    },
    cssVar(name: string) {
      return `--${prefixedName(prefix, name)}`;
    },
    dataAttr(name: string) {
      return `data-${prefixedName(prefix, name)}`;
    },
    dataSelector(name: string) {
      return `[data-${prefixedName(prefix, name)}]`;
    },
    prefix,
  };
}

async function findBundlerProjectConfig(startDir = process.cwd(), boundaryDir?: string): Promise<string | null> {
  let current = path.resolve(startDir);
  const boundary = boundaryDir ? path.resolve(boundaryDir) : "";
  for (;;) {
    const candidate = path.join(current, BUNDLER_PROJECT_CONFIG_PATH);
    if (await pathExists(candidate)) return candidate;
    if (boundary && current === boundary) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function importBundlerProjectConfig(filePath: string): Promise<unknown> {
  const imported = await import(pathToFileURL(filePath).href);
  return imported.default;
}

async function loadBundlerProjectConfig(
  projectRoot = process.cwd(),
  options: LoadBundlerProjectConfigOptions = {},
): Promise<LoadedBundlerProjectConfig> {
  const root = path.resolve(projectRoot);
  const configPath = options.configPath
  ? path.resolve(root, options.configPath)
  : await findBundlerProjectConfig(options.searchFrom || root, root);
  if (!configPath) {
    if (options.defaultIfMissing === false) throw new Error("Bundler project config was not found");
    return { config: normalizeBundlerProjectConfig({}), configPath: null, dependencies: [] };
  }
  if (!await pathExists(configPath)) throw new Error(`Bundler project config was not found: ${configPath}`);
  return {
    config: normalizeBundlerProjectConfig(await importBundlerProjectConfig(configPath)),
    configPath,
    dependencies: [configPath],
  };
}

export {
  BUNDLER_PROJECT_CONFIG_PATH,
  createBundlerNamespace,
  defineBundlerConfig,
  defineBundlerProjectConfig,
  findBundlerProjectConfig,
  loadBundlerConfigModule,
  loadBundlerProjectConfig,
  normalizeBundlerPrefix,
  normalizeBundlerProjectConfig,
};
export type { LoadBundlerProjectConfigOptions };
