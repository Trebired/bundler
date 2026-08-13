import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  BundlerNamespace,
  BundlerOptions,
  BundlerProjectBuildConfig,
  BundlerProjectConfig,
  BundlerProjectFrontendConfig,
  BundlerProjectStaticAssetsConfig,
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
    build: normalizeBuildConfig(source.build),
    frontend: normalizeFrontendConfig(source.frontend),
    i18n: normalizeI18nConfig(source.i18n),
    prefix: normalizeBundlerPrefix(source.prefix),
    staticAssets: normalizeStaticAssetsConfig(source.staticAssets),
  };
}

function normalizeBuildConfig(input: BundlerProjectBuildConfig | undefined): BundlerProjectBuildConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
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
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
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
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
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
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return pickDefined({
      blockPrivate: input.blockPrivate,
      blockSourceMaps: input.blockSourceMaps,
      devCacheControl: normalizeOptionalString(input.devCacheControl),
      immutableCacheControl: normalizeOptionalString(input.immutableCacheControl),
  });
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

function cloneRecord<TValue>(value: Record<string, TValue>|undefined): Record<string, TValue>|undefined {
  return value ? { ...value } : undefined;
}

function normalizeStringList(value: readonly string[] | undefined): string[] | undefined {
  const list = Array.from(new Set((value || []).map(normalizeOptionalString).filter(Boolean)));
  return list.length > 0 ? list : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function pickDefined<TValue extends Record<string, unknown>>(input: TValue): Partial<TValue> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<TValue>;
}

async function findBundlerProjectConfig(startDir = process.cwd(), boundaryDir?: string): Promise<string|null> {
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
  pickDefined,
};
export type { LoadBundlerProjectConfigOptions };
