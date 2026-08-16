import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  BundlerProjectBuildConfig,
  BundlerProjectConfig,
  BundlerProjectFrontendConfig,
  BundlerProjectStaticAssetsConfig,
  LoadedBundlerProjectConfig,
  NormalizedBundlerProjectConfig,
} from "#3c8d8166992a";
import {
  PACKAGE_VERSION,
  PACKAGE_WORKSPACE_CONFIG_DIR,
} from "#m7884285ke1w";
import { pathExists } from "#47cd321d28f1";
import {
  isRecord,
  toTrimmedString,
  uniqueStrings,
} from "@trebired/utils";
import { resolveForVersion } from "@trebired/utils";
import {
  createBundlerNamespace,
  normalizeBundlerPrefix,
} from "./namespace.js";

type LoadBundlerProjectConfigOptions = {
  configPath?: string;
  defaultIfMissing?: boolean;
  searchFrom?: string;
};

type NormalizeOptions = {
  configPath?: string;
  requireForVersion?: boolean;
};

const BUNDLER_PROJECT_CONFIG_PATH = `${PACKAGE_WORKSPACE_CONFIG_DIR}/bundler/config.ts`;

function createConfigDefiner<T>(): (config: T) => T {
  return (config) => config;
}

const defineConfig = createConfigDefiner<BundlerProjectConfig>();

function normalizeBundlerProjectConfig(
  config: unknown = {},
  options: NormalizeOptions = {},
): NormalizedBundlerProjectConfig {
  if (!isRecord(config)) {
    throw new Error("Bundler project config must be an object");
  }
  const source = config as BundlerProjectConfig;
  return {
    build: normalizeBuildConfig(source.build),
    forVersion: normalizeForVersion(source, options),
    frontend: normalizeFrontendConfig(source.frontend),
    i18n: normalizeI18nConfig(source.i18n),
    prefix: normalizeBundlerPrefix(source.prefix),
    staticAssets: normalizeStaticAssetsConfig(source.staticAssets),
  };
}

function normalizeBuildConfig(input: BundlerProjectBuildConfig | undefined): BundlerProjectBuildConfig {
  if (!isRecord(input)) return {};
  return pickDefined({
      annotateSources: input.annotateSources,
      loader: cloneRecord(input.loader),
      minify: input.minify,
      outputLayout: input.outputLayout,
      precompress: input.precompress,
      publicPath: normalizeOptionalString(input.publicPath),
      sourcemap: input.sourcemap,
      stripComments: input.stripComments,
  });
}

function normalizeFrontendConfig(input: BundlerProjectFrontendConfig | undefined): BundlerProjectFrontendConfig {
  if (!isRecord(input)) return {};
  return pickDefined({
      deferredClientEntryKey: normalizeOptionalString(input.deferredClientEntryKey),
      frontendDir: normalizeOptionalString(input.frontendDir),
      globalClientEntryExclude: normalizeStringList(input.globalClientEntryExclude),
      globalClientEntryInclude: normalizeStringList(input.globalClientEntryInclude),
      globalStyleExclude: normalizeStringList(input.globalStyleExclude),
      globalStyleInclude: normalizeStringList(input.globalStyleInclude),
      globalStyleRuleKey: normalizeOptionalString(input.globalStyleRuleKey),
      ignoredSourceInclude: normalizeStringList(input.ignoredSourceInclude),
      publicDir: input.publicDir === false ? false : normalizeOptionalString(input.publicDir),
  });
}

function normalizeI18nConfig(input: BundlerProjectConfig["i18n"]): BundlerProjectConfig["i18n"] {
  if (typeof input === "boolean" || input === undefined) return input;
  if (!isRecord(input)) return undefined;
  return pickDefined({
      defaultLanguage: normalizeOptionalString(input.defaultLanguage),
      dirName: normalizeOptionalString(input.dirName),
      enabled: input.enabled,
      extensions: normalizeStringList(input.extensions),
      supportedLanguages: normalizeStringList(input.supportedLanguages),
  });
}

function normalizeStaticAssetsConfig(
  input: BundlerProjectStaticAssetsConfig | undefined,
): BundlerProjectStaticAssetsConfig {
  if (!isRecord(input)) return {};
  return pickDefined({
      blockPrivate: input.blockPrivate,
      blockSourceMaps: input.blockSourceMaps,
      devCacheControl: normalizeOptionalString(input.devCacheControl),
      immutableCacheControl: normalizeOptionalString(input.immutableCacheControl),
  });
}

function cloneRecord<TValue>(value: Record<string, TValue>|undefined): Record<string, TValue>|undefined {
  return value ? { ...value } : undefined;
}

function normalizeStringList(value: readonly string[] | undefined): string[] | undefined {
  const list = uniqueStrings(value || []);
  return list.length > 0 ? list : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = toTrimmedString(value);
  return normalized || undefined;
}

function normalizeForVersion(
  config: BundlerProjectConfig,
  options: NormalizeOptions,
): string {
  return resolveForVersion({
      configPath: options.configPath,
      forVersion: config.forVersion,
      label: "bundler",
      packageVersion: PACKAGE_VERSION,
      requireForVersion: options.requireForVersion,
  });
}

function pickDefined<TValue extends Record<string, unknown>>(input: TValue): Partial<TValue> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<TValue>;
}

async function findConfig(startDir = process.cwd(), boundaryDir?: string): Promise<string|null> {
  let current = path.resolve(startDir);
  const boundary = boundaryDir ? path.resolve(boundaryDir) : "";
  for (;; ) {
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

async function loadConfig(
  projectRoot = process.cwd(),
  options: LoadBundlerProjectConfigOptions = {},
): Promise<LoadedBundlerProjectConfig> {
  const root = path.resolve(projectRoot);
  const configPath = options.configPath
  ? path.resolve(root, options.configPath)
  : await findConfig(options.searchFrom || root, root);
  if (!configPath) {
    if (options.defaultIfMissing === false) throw new Error("Bundler project config was not found");
    return {
      config: normalizeBundlerProjectConfig(
        { forVersion: PACKAGE_VERSION },
        { requireForVersion: false },
      ),
      configPath: null,
      dependencies: [],
    };
  }
  if (!await pathExists(configPath)) throw new Error(`Bundler project config was not found: ${configPath}`);
  return {
    config: normalizeBundlerProjectConfig(
      await importBundlerProjectConfig(configPath),
      { configPath, requireForVersion: true },
    ),
    configPath,
    dependencies: [configPath],
  };
}

export {
  BUNDLER_PROJECT_CONFIG_PATH,
  createBundlerNamespace,
  defineConfig,
  findConfig,
  loadConfig,
  normalizeBundlerPrefix,
  normalizeBundlerProjectConfig,
  pickDefined,
};
export type { LoadBundlerProjectConfigOptions };
export {
  generateNamespaceModule,
  writeNamespaceModule,
} from "./namespace-module.js";
export type {
  GenerateNamespaceModuleOptions,
  WriteNamespaceModuleOptions,
} from "./namespace-module.js";
