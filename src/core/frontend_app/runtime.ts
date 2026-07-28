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
} from "#3c8d8166992a";
import { watch } from "#644f3e1f42a8";
import { collectFrontendAssetLinks } from "./assets.js";
import { createFrontendBundlerRuntimeConfig } from "./config.js";
import {
  extractAssetManifest,
  readBundlerManifest,
  resolveAssetManifestEntryOutputPath,
} from "./manifest.js";
import { buildRelatedClientEntryMap } from "./related.js";

type RuntimeSessionState = {
  clientWatch?: BundlerWatchSession;
  config: BundlerFrontendRuntimeConfig;
  runtime?: BundlerFrontendRuntimeState;
  ssrEntryMtime?: number;
  ssrWatch?: BundlerWatchSession;
};

function createFrontendBundlerRuntime(
  input: BundlerFrontendRuntimeConfig | BundlerFrontendAppBundlerConfig | BundlerFrontendAppBundlerConfigOptions,
): BundlerFrontendRuntime {
  const state: RuntimeSessionState = { config: normalizeRuntimeConfig(input) };
  return {
    buildAssetLinks: (pageIds) => buildRuntimeAssetLinks(state, pageIds),
    dispose: () => disposeRuntime(state),
    ensure: () => ensureRuntime(state),
    getRuntime: () => state.runtime,
    resolvePageComponent: (pageId) => resolveRuntimePageComponent(state, pageId),
    resolveRootDocument: () => resolveRuntimeRootDocument(state),
  };
}

async function ensureRuntime(state: RuntimeSessionState): Promise<BundlerFrontendRuntimeState> {
  return state.config.mode === "development" ? ensureDevelopmentRuntime(state) : ensureProductionRuntime(state);
}

async function ensureDevelopmentRuntime(state: RuntimeSessionState): Promise<BundlerFrontendRuntimeState> {
  if (!state.clientWatch) state.clientWatch = await watch(createWatchedOptions(state, "client"));
  const client = await state.clientWatch.rebuild();
  const ssr = state.config.ssrOptions ? await ensureDevelopmentSsr(state) : undefined;
  await updateRuntimeFromBuilds(state, client, ssr);
  return state.runtime!;
}

async function ensureDevelopmentSsr(state: RuntimeSessionState): Promise<BundlerBuildResult | undefined> {
  if (!state.config.ssrOptions) return undefined;
  if (!state.ssrWatch) state.ssrWatch = await watch(createWatchedOptions(state, "ssr"));
  return state.ssrWatch.rebuild();
}

async function ensureProductionRuntime(state: RuntimeSessionState): Promise<BundlerFrontendRuntimeState> {
  if (state.runtime) return state.runtime;
  const clientManifest = await readRuntimeAssetManifest(state.config.clientManifestPath);
  const ssrManifest = await readRuntimeAssetManifest(state.config.ssrManifestPath);
  const relatedClientEntryMap = ssrManifest ? await buildRuntimeRelatedMap(state.config, ssrManifest) : {};
  const ssrModule = ssrManifest ? await importSsrModule(state, ssrManifest) : undefined;
  state.runtime = { clientManifest, relatedClientEntryMap, ssrManifest, ssrModule };
  return state.runtime;
}

async function updateRuntimeFromBuilds(
  state: RuntimeSessionState,
  client: BundlerBuildResult,
  ssr: BundlerBuildResult | undefined,
): Promise<void> {
  const ssrManifest = ssr?.assetManifest;
  const relatedClientEntryMap = ssrManifest ? await buildRuntimeRelatedMap(state.config, ssrManifest) : {};
  const ssrModule = ssrManifest ? await importSsrModule(state, ssrManifest) : undefined;
  state.runtime = {
    client,
    clientManifest: client.assetManifest,
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
    onRebuilt: async (result: BundlerBuildResult) => {
      await originalHook?.(result);
      if (kind === "client" && state.runtime) state.runtime.client = result;
      if (kind === "ssr" && state.runtime?.client) await updateRuntimeFromBuilds(state, state.runtime.client, result);
    },
  };
}

async function importSsrModule(
  state: RuntimeSessionState,
  manifest: BundlerAssetManifest,
): Promise<Record<string, unknown> | undefined> {
  const entryPath = resolveRuntimeSsrEntryPath(state.config, manifest);
  if (!entryPath) return undefined;
  const stats = await fs.stat(entryPath);
  if (state.runtime?.ssrModule && state.ssrEntryMtime === stats.mtimeMs) return state.runtime.ssrModule;
  state.ssrEntryMtime = stats.mtimeMs;
  return import(`${pathToFileURL(entryPath).href}?mtime=${stats.mtimeMs}`) as Promise<Record<string, unknown>>;
}

async function buildRuntimeRelatedMap(
  config: BundlerFrontendRuntimeConfig,
  ssrManifest: BundlerAssetManifest,
): Promise<Record<string, string[]>> {
  if (!config.ssr) return {};
  return buildRelatedClientEntryMap({
    manifest: ssrManifest,
    pageId: config.pageId || { collapseIndex: config.ssr.collapseIndex, sourcePrefix: `${config.frontendDir}/pages` },
    rootDir: config.rootDir,
    ruleKey: config.ssr.key,
    tsconfig: config.tsconfig,
  });
}

async function buildRuntimeAssetLinks(
  state: RuntimeSessionState,
  pageIds: readonly string[] = [],
) {
  const runtime = await ensureRuntime(state);
  if (!runtime.clientManifest) throw new Error("bundler-frontend-runtime-client-manifest-missing");
  return collectFrontendAssetLinks({
    collect: { publicPath: state.config.clientOptions.publicPath },
    globalEntryIds: state.config.globalClientEntries,
    globalStyleRuleKey: state.config.globalStyleRuleKey,
    manifest: runtime.clientManifest,
    pageIds,
    relatedEntryMap: runtime.relatedClientEntryMap,
    renderTags: state.config.renderTags,
  });
}

async function resolveRuntimePageComponent(state: RuntimeSessionState, pageId: string): Promise<unknown> {
  const runtime = await ensureRuntime(state);
  const resolver = runtime.ssrModule?.[state.config.ssr?.resolverExport || "getModule"];
  if (typeof resolver === "function") return resolver(pageId);
  const modules = runtime.ssrModule?.[state.config.ssr?.mapExport || "modules"];
  return modules && typeof modules === "object" ? (modules as Record<string, unknown>)[pageId] : undefined;
}

async function resolveRuntimeRootDocument(state: RuntimeSessionState): Promise<unknown> {
  const runtime = await ensureRuntime(state);
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

async function readRuntimeAssetManifest(filePath: string | undefined): Promise<BundlerAssetManifest | undefined> {
  if (!filePath) return undefined;
  const raw = await readBundlerManifest(filePath);
  return extractAssetManifest(raw);
}

async function disposeRuntime(state: RuntimeSessionState): Promise<void> {
  await state.clientWatch?.dispose();
  await state.ssrWatch?.dispose();
}

function normalizeRuntimeConfig(
  input: BundlerFrontendRuntimeConfig | BundlerFrontendAppBundlerConfig | BundlerFrontendAppBundlerConfigOptions,
): BundlerFrontendRuntimeConfig {
  if ("clientManifestPath" in input) return input;
  return createFrontendBundlerRuntimeConfig(input);
}

export {
  createFrontendBundlerRuntime,
};
