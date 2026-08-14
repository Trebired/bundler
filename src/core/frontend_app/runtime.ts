import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  BundlerAssetManifest,
  BundlerBuildResult,
  BundlerFrontendAppBundlerConfig,
  BundlerFrontendAppBundlerConfigOptions,
  BundlerFrontendRuntime,
  BundlerFrontendRuntimeConfig,
  BundlerFrontendRuntimeState,
  BundlerWatchSession,
  NormalizedBundlerLogger,
} from "#3c8d8166992a";
import { watch } from "#644f3e1f42a8";
import { collectFrontendAssetLinks } from "./assets.js";
import { createFrontendBundlerRuntimeConfig } from "./config.js";
import { resolveConfiguredFrontendGlobalClientEntries } from "./global.js";
import {
  collectAggregateMatchedSourcesByRuleKey,
  extractAssetManifest,
  readBundlerManifest,
  resolveAssetManifestEntryOutputPath,
} from "./manifest.js";
import { prepareSsrNodeModules } from "./node_modules.js";
import { buildRelatedClientEntryMap } from "./related.js";
import { resolveRuntimeLogger, timeRuntimeStep } from "./runtime-logging.js";

type RuntimeSessionState = {
  clientBuild?: BundlerBuildResult;
  clientWatch?: BundlerWatchSession;
  config: BundlerFrontendRuntimeConfig;
  ensurePromise?: Promise<BundlerFrontendRuntimeState>;
  logger: NormalizedBundlerLogger;
  nodeModulesCache?: RuntimeNodeModulesCache;
  relatedMapCache?: RuntimeRelatedMapCache;
  runtime?: BundlerFrontendRuntimeState;
  ssrBuild?: BundlerBuildResult;
  ssrEntryMtime?: number;
  ssrWatch?: BundlerWatchSession;
};

type RuntimeNodeModulesCache = {
  signature: string;
  targetPath?: string;
  value: BundlerFrontendRuntimeState["nodeModules"];
};

type RuntimeRelatedMapCache = {
  signature: string;
  value: Record<string, string[]>;
};

function createFrontendBundlerRuntime(
  input: BundlerFrontendRuntimeConfig | BundlerFrontendAppBundlerConfig | BundlerFrontendAppBundlerConfigOptions,
): BundlerFrontendRuntime {
  const config = normalizeRuntimeConfig(input);
  const state: RuntimeSessionState = {
    config,
    logger: resolveRuntimeLogger(config),
  };
  return {
    buildAssetLinks: (pageIds) => buildRuntimeAssetLinks(state, pageIds),
    buildAssetLinksSync: (pageIds) => buildRuntimeAssetLinksSync(state, pageIds),
    dispose: () => disposeRuntime(state),
    ensure: () => ensureRuntime(state),
    getRuntime: () => state.runtime,
    resolvePageComponent: (pageId) => resolveRuntimePageComponent(state, pageId),
    resolvePageComponentSync: (pageId) => resolveRuntimePageComponentSync(state, pageId),
    resolveRootDocument: () => resolveRuntimeRootDocument(state),
    resolveRootDocumentSync: () => resolveRuntimeRootDocumentSync(state),
  };
}

async function ensureRuntime(state: RuntimeSessionState): Promise<BundlerFrontendRuntimeState> {
  if (state.ensurePromise) return state.ensurePromise;
  const next = ensureRuntimeUncached(state);
  state.ensurePromise = next;
  try {
    return await next;
  } finally {
    if (state.ensurePromise === next) state.ensurePromise = undefined;
  }
}

async function ensureRuntimeUncached(state: RuntimeSessionState): Promise<BundlerFrontendRuntimeState> {
  return state.config.mode === "development" ? ensureDevelopmentRuntime(state) : ensureProductionRuntime(state);
}

async function ensureDevelopmentRuntime(state: RuntimeSessionState): Promise<BundlerFrontendRuntimeState> {
  return timeRuntimeStep(state, "development runtime", async() => {
      const [client, ssr] = await Promise.all([
          ensureDevelopmentClient(state),
          ensureDevelopmentSsr(state),
      ]);
      await updateRuntimeFromBuilds(state, client, ssr);
      return state.runtime!;
  });
}

async function ensureDevelopmentClient(state: RuntimeSessionState): Promise<BundlerBuildResult> {
  if (!state.clientWatch) {
    state.clientWatch = await timeRuntimeStep(state, "client watch setup", () => watch(createWatchedOptions(state, "client")));
  }

  return state.clientBuild ?? timeRuntimeStep(state, "client rebuild", () => state.clientWatch!.rebuild());
}

async function ensureDevelopmentSsr(state: RuntimeSessionState): Promise<BundlerBuildResult|undefined> {
  if (!state.config.ssrOptions) return undefined;
  if (!state.ssrWatch) {
    state.ssrWatch = await timeRuntimeStep(state, "ssr watch setup", () => watch(createWatchedOptions(state, "ssr")));
  }

  return state.ssrBuild ?? timeRuntimeStep(state, "ssr rebuild", () => state.ssrWatch!.rebuild());
}

async function ensureProductionRuntime(state: RuntimeSessionState): Promise<BundlerFrontendRuntimeState> {
  if (state.runtime) return state.runtime;
  return timeRuntimeStep(state, "production runtime", async() => {
      const [clientManifest, ssrManifest] = await Promise.all([
          timeRuntimeStep(state, "client manifest read", () => readRuntimeAssetManifest(state.config.clientManifestPath)),
          timeRuntimeStep(state, "ssr manifest read", () => readRuntimeAssetManifest(state.config.ssrManifestPath)),
      ]);
      const globalClientEntries = resolveConfiguredFrontendGlobalClientEntries(state.config, clientManifest);
      const [relatedClientEntryMap, nodeModules] = await Promise.all([
          ssrManifest ? buildRuntimeRelatedMap(state, ssrManifest) : {},
          ssrManifest ? prepareRuntimeSsrNodeModules(state) : undefined,
      ]);
      const ssrModule = ssrManifest ? await importSsrModule(state, ssrManifest) : undefined;
      state.runtime = { clientManifest, globalClientEntries, nodeModules, relatedClientEntryMap, ssrManifest, ssrModule };
      return state.runtime;
  });
}

async function updateRuntimeFromBuilds(
  state: RuntimeSessionState,
  client: BundlerBuildResult,
  ssr: BundlerBuildResult | undefined,
): Promise<void> {
  const ssrManifest = ssr?.assetManifest;
  const globalClientEntries = resolveConfiguredFrontendGlobalClientEntries(state.config, client.assetManifest);
  const [relatedClientEntryMap, nodeModules] = await Promise.all([
      ssrManifest ? buildRuntimeRelatedMap(state, ssrManifest) : {},
      ssrManifest ? prepareRuntimeSsrNodeModules(state) : undefined,
  ]);
  const ssrModule = ssrManifest ? await importSsrModule(state, ssrManifest) : undefined;
  state.runtime = {
    client,
    clientManifest: client.assetManifest,
    globalClientEntries,
    nodeModules,
    relatedClientEntryMap,
    ssr,
    ssrManifest,
    ssrModule,
  };
}

function createWatchedOptions(state: RuntimeSessionState, kind: "client" | "ssr") {
  const options = kind === "client" ? state.config.clientOptions : state.config.ssrOptions!;
  const originalHook = options.onRebuilt;
  return {
    ...options,
    onRebuilt: async(result: BundlerBuildResult) => {
      await originalHook?.(result);
      if (kind === "client") state.clientBuild = result;
      else state.ssrBuild = result;

      if (!state.runtime) return;

      const client = kind === "client" ? result : state.clientBuild ?? state.runtime.client;
      if (!client) return;

      const ssr = state.config.ssrOptions
      ? kind === "ssr" ? result : state.ssrBuild ?? state.runtime.ssr
      : undefined;
      await updateRuntimeFromBuilds(state, client, ssr);
    },
  };
}

async function importSsrModule(
  state: RuntimeSessionState,
  manifest: BundlerAssetManifest,
): Promise<Record<string, unknown>|undefined> {
  const entryPath = resolveRuntimeSsrEntryPath(state.config, manifest);
  if (!entryPath) return undefined;
  const stats = await fs.stat(entryPath);
  if (state.runtime?.ssrModule && state.ssrEntryMtime === stats.mtimeMs) return state.runtime.ssrModule;
  state.ssrEntryMtime = stats.mtimeMs;
  return timeRuntimeStep(state, "ssr module import", () => {
      return import(`${pathToFileURL(entryPath).href}?mtime=${stats.mtimeMs}`) as Promise<Record<string, unknown>>;
  });
}

async function buildRuntimeRelatedMap(
  state: RuntimeSessionState,
  ssrManifest: BundlerAssetManifest,
): Promise<Record<string, string[]>> {
  const config = state.config;
  if (!config.ssr) return {};
  const input = resolveRuntimeRelatedMapInput(config, ssrManifest);
  if (state.relatedMapCache?.signature === input.signature) return state.relatedMapCache.value;
  const value = await timeRuntimeStep(state, "related-client map", () => buildRelatedClientEntryMap({
        aggregateSources: input.sources,
        pageId: config.pageId || { collapseIndex: config.ssr!.collapseIndex, sourcePrefix: `${config.frontendDir}/pages` },
        rootDir: config.rootDir,
        ruleKey: config.ssr!.key,
        tsconfig: config.tsconfig,
  }));
  state.relatedMapCache = {
    signature: input.signature,
    value,
  };
  return value;
}

async function prepareRuntimeSsrNodeModules(
  state: RuntimeSessionState,
): Promise<BundlerFrontendRuntimeState["nodeModules"]> {
  const signature = createSsrNodeModulesSignature(state.config);
  if (await canReuseNodeModulesCache(state.nodeModulesCache, signature)) return state.nodeModulesCache?.value;
  const value = await timeRuntimeStep(state, "ssr node_modules prep", () => {
      return prepareSsrNodeModules(state.config, state.config.nodeModules);
  });
  state.nodeModulesCache = {
    signature,
    targetPath: resolveRuntimeSsrNodeModulesTargetPath(state.config),
    value,
  };
  return value;
}

async function canReuseNodeModulesCache(
  cache: RuntimeNodeModulesCache | undefined,
  signature: string,
): Promise<boolean> {
  if (!cache || cache.signature !== signature) return false;
  if (!cache.value || !cache.targetPath) return true;
  return fs.access(cache.targetPath).then(() => true, () => false);
}

function resolveRuntimeRelatedMapInput(
  config: BundlerFrontendRuntimeConfig,
  ssrManifest: BundlerAssetManifest,
) {
  const sources = collectAggregateMatchedSourcesByRuleKey(ssrManifest, config.ssr!.key);
  return {
    sources,
    signature: JSON.stringify({
        pageId: config.pageId,
        rootDir: config.rootDir,
        ruleKey: config.ssr!.key,
        sources,
        tsconfig: config.tsconfig,
    }),
  };
}

function createSsrNodeModulesSignature(config: BundlerFrontendRuntimeConfig): string {
  const options = config.nodeModules;
  return JSON.stringify({
      options,
      rootDir: config.rootDir,
      ssrOutDir: config.ssrOutDir,
      targetPath: resolveRuntimeSsrNodeModulesTargetPath(config),
  });
}

function resolveRuntimeSsrNodeModulesTargetPath(config: BundlerFrontendRuntimeConfig): string | undefined {
  const strategy = config.nodeModules?.strategy || "none";
  if (strategy === "none" || !config.ssrOutDir) return undefined;
  return path.resolve(config.rootDir, config.nodeModules?.targetDir || path.join(config.ssrOutDir, "node_modules"));
}

async function buildRuntimeAssetLinks(
  state: RuntimeSessionState,
  pageIds: readonly string[] = [],
) {
  await ensureRuntime(state);
  return buildRuntimeAssetLinksSync(state, pageIds);
}

function buildRuntimeAssetLinksSync(
  state: RuntimeSessionState,
  pageIds: readonly string[] = [],
) {
  const runtime = getEnsuredRuntime(state);
  if (!runtime.clientManifest) throw new Error("bundler-frontend-runtime-client-manifest-missing");
  return collectFrontendAssetLinks({
      collect: { publicPath: state.config.clientOptions.publicPath },
      globalEntryIds: runtime.globalClientEntries,
      globalStyleRuleKey: state.config.globalStyleRuleKey,
      manifest: runtime.clientManifest,
      pageIds,
      relatedEntryMap: runtime.relatedClientEntryMap,
      renderTags: state.config.renderTags,
  });
}

async function resolveRuntimePageComponent(state: RuntimeSessionState, pageId: string): Promise<unknown> {
  await ensureRuntime(state);
  return resolveRuntimePageComponentSync(state, pageId);
}

function resolveRuntimePageComponentSync(state: RuntimeSessionState, pageId: string): unknown {
  const runtime = getEnsuredRuntime(state);
  const resolver = runtime.ssrModule?.[state.config.ssr?.resolverExport || "getModule"];
  if (typeof resolver === "function") return resolver(pageId);
  const modules = runtime.ssrModule?.[state.config.ssr?.mapExport || "modules"];
  return modules && typeof modules === "object" ? (modules as Record<string, unknown>)[pageId] : undefined;
}

async function resolveRuntimeRootDocument(state: RuntimeSessionState): Promise<unknown> {
  await ensureRuntime(state);
  return resolveRuntimeRootDocumentSync(state);
}

function resolveRuntimeRootDocumentSync(state: RuntimeSessionState): unknown {
  const runtime = getEnsuredRuntime(state);
  return runtime.ssrModule?.[state.config.ssr?.rootExport || "rootModule"];
}

function resolveRuntimeSsrEntryPath(
  config: BundlerFrontendRuntimeConfig,
  manifest: BundlerAssetManifest,
): string | undefined {
  if (!config.ssr || !config.ssrOutDir) return undefined;
  return resolveAssetManifestEntryOutputPath({
      entryId: config.ssr.key,
      from: "ruleKey",
      manifest,
      outDir: path.resolve(config.rootDir, config.ssrOutDir),
  });
}

async function readRuntimeAssetManifest(filePath: string | undefined): Promise<BundlerAssetManifest|undefined> {
  if (!filePath) return undefined;
  const raw = await readBundlerManifest(filePath).catch ((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
  });
  if (!raw) return undefined;
  return extractAssetManifest(raw);
}

async function disposeRuntime(state: RuntimeSessionState): Promise<void> {
  await state.clientWatch?.dispose();
  await state.ssrWatch?.dispose();
  state.clientBuild = undefined;
  state.nodeModulesCache = undefined;
  state.relatedMapCache = undefined;
  state.ssrBuild = undefined;
}

function normalizeRuntimeConfig(
  input: BundlerFrontendRuntimeConfig | BundlerFrontendAppBundlerConfig | BundlerFrontendAppBundlerConfigOptions,
): BundlerFrontendRuntimeConfig {
  if ("clientManifestPath"in input) return input;
  return createFrontendBundlerRuntimeConfig(input);
}

function getEnsuredRuntime(state: RuntimeSessionState): BundlerFrontendRuntimeState {
  if (!state.runtime) throw new Error("bundler-frontend-runtime-not-ensured");
  return state.runtime;
}

export {
  createFrontendBundlerRuntime,
};
