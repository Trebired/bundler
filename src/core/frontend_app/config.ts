import path from "node:path";

import type {
  BundlerDiscoverRule,
  BundlerFrontendAppBundlerConfig,
  BundlerFrontendAppBundlerConfigOptions,
  BundlerFrontendAppBundlerOptions,
  BundlerFrontendRuntimeConfig,
  BundlerOptions,
  BundlerResolvedSsrModuleMapRuleOptions,
} from "#3c8d8166992a";
import {
  createFrontendEntryRules,
  DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS,
} from "#b144bhz25e6y";
import { normalizePathValue } from "#tsnh4vdfql8p";
import {
  DEFAULT_FRONTEND_CLIENT_ENTRY_KEY,
  DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_KEY,
  DEFAULT_FRONTEND_GLOBAL_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_GLOBAL_STYLE_PATTERNS,
  DEFAULT_FRONTEND_GLOBAL_STYLE_RULE_KEY,
  DEFAULT_FRONTEND_IGNORED_SOURCE_PATTERNS,
  DEFAULT_FRONTEND_PUBLIC_DIR,
  DEFAULT_FRONTEND_RUNTIME_SOURCE_PATTERNS,
  DEFAULT_FRONTEND_SOURCE_DIR,
} from "./defaults.js";
import { createSsrModuleMapRule, resolveSsrModuleMapRuleOptions } from "./ssr.js";

function defineFrontendBundlerConfig(options: BundlerFrontendAppBundlerConfigOptions): BundlerFrontendAppBundlerConfig {
  const base = normalizeFrontendConfigBase(options);
  const ssr = normalizeSsrRuleOptions(options, base.ssrOutDir);
  return {
    ...base,
    ssr,
    clientOptions: createClientOptions(options, base),
    ssrOptions: ssr ? createSsrOptions(options, base, ssr) : undefined,
  };
}

function createFrontendAppBundlerOptions(
  options: BundlerFrontendAppBundlerConfigOptions | BundlerFrontendAppBundlerConfig,
): BundlerFrontendAppBundlerOptions {
  const config = "clientOptions" in options ? options : defineFrontendBundlerConfig(options);
  return {
    client: config.clientOptions,
    config,
    ssr: config.ssrOptions,
  };
}

function createFrontendBundlerRuntimeConfig(
  options: BundlerFrontendAppBundlerConfigOptions | BundlerFrontendAppBundlerConfig,
): BundlerFrontendRuntimeConfig {
  const { config } = createFrontendAppBundlerOptions(options);
  return {
    ...config,
    clientManifestPath: path.resolve(config.rootDir, config.clientOutDir, "bundler-manifest.json"),
    pageId: config.ssr ? { collapseIndex: config.ssr.collapseIndex, sourcePrefix: `${config.frontendDir}/pages` } : undefined,
    renderTags: true,
    ssrManifestPath: config.ssrOutDir ? path.resolve(config.rootDir, config.ssrOutDir, "bundler-manifest.json") : undefined,
  };
}

function createClientOptions(
  options: BundlerFrontendAppBundlerConfigOptions,
  base: ReturnType<typeof normalizeFrontendConfigBase>,
): BundlerOptions {
  const overrides = options.browser || {};
  return {
    ...createCommonBuildOptions(options, base, overrides, base.mode === "production"),
    discover: { dir: base.frontendDir, rules: createClientDiscoverRules(options, base) },
    environment: "browser",
    format: "esm",
    outDir: base.clientOutDir,
    splitting: overrides.splitting ?? true,
    target: overrides.target || "es2020",
    ...pickLooseOverrides(overrides),
  };
}

function createSsrOptions(
  options: BundlerFrontendAppBundlerConfigOptions,
  base: ReturnType<typeof normalizeFrontendConfigBase>,
  ssr: BundlerResolvedSsrModuleMapRuleOptions,
): BundlerOptions {
  const overrides = options.node || {};
  return {
    ...createCommonBuildOptions(options, base, overrides, false),
    discover: { dir: base.frontendDir, rules: createSsrDiscoverRules(options, ssr) },
    environment: "node",
    format: "esm",
    outDir: base.ssrOutDir!,
    splitting: overrides.splitting ?? false,
    target: overrides.target || "node18",
    ...pickLooseOverrides(overrides),
  };
}

function normalizeFrontendConfigBase(options: BundlerFrontendAppBundlerConfigOptions) {
  const rootDir = path.resolve(String(options.rootDir || "").trim() || process.cwd());
  const frontendDir = normalizeRootRelative(rootDir, options.frontendDir || DEFAULT_FRONTEND_SOURCE_DIR);
  const publicDir = normalizePublicDir(rootDir, frontendDir, options.publicDir);
  return {
    clientOutDir: normalizeRootRelative(rootDir, options.clientOutDir),
    deferredClientEntryKey: options.deferredClientEntryKey || DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_KEY,
    frontendDir,
    globalClientEntries: options.globalClientEntries || "auto",
    globalClientEntryExclude: options.globalClientEntryExclude?.slice() || [],
    globalClientEntryInclude: options.globalClientEntryInclude?.slice() || [...DEFAULT_FRONTEND_GLOBAL_CLIENT_ENTRY_PATTERNS],
    globalStyleRuleKey: options.globalStyleRuleKey || DEFAULT_FRONTEND_GLOBAL_STYLE_RULE_KEY,
    mode: options.mode || "production",
    nodeModules: options.nodeModules,
    publicDir,
    rootDir,
    ssrOutDir: options.ssrOutDir ? normalizeRootRelative(rootDir, options.ssrOutDir) : undefined,
  };
}

function createCommonBuildOptions(
  options: BundlerFrontendAppBundlerConfigOptions,
  base: ReturnType<typeof normalizeFrontendConfigBase>,
  overrides: Partial<BundlerOptions>,
  precompressDefault: boolean,
): Omit<BundlerOptions, "discover" | "outDir"> {
  return {
    clean: overrides.clean,
    define: { ...(options.define || {}), ...(overrides.define || {}) },
    external: overrides.external,
    i18n: options.supportedI18nLanguages?.length ? { supportedLanguages: options.supportedI18nLanguages } : overrides.i18n,
    loader: overrides.loader,
    logger: options.logger || overrides.logger,
    loggerAdapter: overrides.loggerAdapter,
    manifest: overrides.manifest ?? true,
    minify: overrides.minify ?? options.minify ?? base.mode === "production",
    outputLayout: overrides.outputLayout ?? options.outputLayout ?? true,
    precompress: overrides.precompress ?? options.precompress ?? precompressDefault,
    publicPath: overrides.publicPath ?? options.publicPath,
    rootDir: base.rootDir,
    sourcemap: overrides.sourcemap ?? options.sourcemap ?? base.mode === "development",
    stripComments: overrides.stripComments ?? options.stripComments ?? base.mode === "production",
  };
}

function createClientDiscoverRules(
  options: BundlerFrontendAppBundlerConfigOptions,
  base: ReturnType<typeof normalizeFrontendConfigBase>,
): BundlerDiscoverRule[] {
  return [
    createIgnoredSourceRule(options, base),
    ...createFrontendEntryRules({
      clientKey: DEFAULT_FRONTEND_CLIENT_ENTRY_KEY,
      deferredKey: base.deferredClientEntryKey,
    }),
    createGlobalStyleRule(options, base),
    createRuntimeSourceIgnoreRule(options),
    ...(options.extraClientRules || []),
    createCatchAllIgnoreRule("ignored-client-rest"),
  ];
}

function createSsrDiscoverRules(
  options: BundlerFrontendAppBundlerConfigOptions,
  ssr: BundlerResolvedSsrModuleMapRuleOptions,
): BundlerDiscoverRule[] {
  return [
    createIgnoredSourceRule(options),
    createSsrModuleMapRule({
      ...ssr,
      exclude: mergeLists(ssr.exclude, DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS, DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS),
    }),
    ...(options.extraSsrRules || []),
    createCatchAllIgnoreRule("ignored-ssr-rest"),
  ];
}

function createIgnoredSourceRule(
  options: BundlerFrontendAppBundlerConfigOptions,
  base?: ReturnType<typeof normalizeFrontendConfigBase>,
): BundlerDiscoverRule {
  return {
    key: "ignored-source",
    include: mergeLists(DEFAULT_FRONTEND_IGNORED_SOURCE_PATTERNS, options.ignoredSourceInclude, resolvePublicIgnorePatterns(base)),
    strategy: "ignore",
  };
}

function createGlobalStyleRule(
  options: BundlerFrontendAppBundlerConfigOptions,
  base: ReturnType<typeof normalizeFrontendConfigBase>,
): BundlerDiscoverRule {
  return {
    key: base.globalStyleRuleKey,
    include: options.globalStyleInclude || [...DEFAULT_FRONTEND_GLOBAL_STYLE_PATTERNS],
    exclude: options.globalStyleExclude,
    maxBundleSize: "50mb",
    strategy: "bundle",
  };
}

function createRuntimeSourceIgnoreRule(options: BundlerFrontendAppBundlerConfigOptions): BundlerDiscoverRule {
  return {
    key: "ignored-runtime-source",
    include: mergeLists(DEFAULT_FRONTEND_RUNTIME_SOURCE_PATTERNS, options.ignoredSourceInclude),
    exclude: mergeLists(DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS, DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS),
    strategy: "ignore",
  };
}

function normalizeSsrRuleOptions(
  options: BundlerFrontendAppBundlerConfigOptions,
  ssrOutDir?: string,
): BundlerResolvedSsrModuleMapRuleOptions | undefined {
  if (options.ssr === false || !ssrOutDir) return undefined;
  return resolveSsrModuleMapRuleOptions(options.ssr || {});
}

function pickLooseOverrides(options: Partial<BundlerOptions>): Partial<BundlerOptions> {
  return {
    annotateSources: options.annotateSources,
    onEntrySetChanged: options.onEntrySetChanged,
    onRebuilt: options.onRebuilt,
  };
}

function normalizePublicDir(
  rootDir: string,
  frontendDir: string,
  value: string | false | undefined,
): string | undefined {
  if (value === false) return undefined;
  return normalizeRootRelative(rootDir, value || path.posix.join(frontendDir, DEFAULT_FRONTEND_PUBLIC_DIR));
}

function resolvePublicIgnorePatterns(base?: ReturnType<typeof normalizeFrontendConfigBase>): string[] {
  if (!base?.publicDir || !base.publicDir.startsWith(`${base.frontendDir}/`)) return [];
  return [`${base.publicDir.slice(base.frontendDir.length + 1)}/**/*`];
}

function createCatchAllIgnoreRule(key: string): BundlerDiscoverRule {
  return { key, include: ["**/*"], strategy: "ignore" };
}

function mergeLists(...values: Array<readonly string[] | undefined>): string[] {
  return Array.from(new Set(values.flatMap((items) => items || []))).filter(Boolean);
}

function normalizeRootRelative(rootDir: string, value: string): string {
  if (!value) throw new Error("bundler-frontend-missing-path");
  return normalizePathValue(path.isAbsolute(value) ? path.relative(rootDir, value) : value);
}

export {
  createFrontendAppBundlerOptions,
  createFrontendBundlerRuntimeConfig,
  defineFrontendBundlerConfig,
};
