import type { IncomingHttpHeaders } from "node:http";

import type { BundlerDiscoverAggregateRule, BundlerDiscoverRule } from "./discovery.js";
import type { BundlerFrontendEntryRulesOptions } from "./frontend.js";
import type { BundlerImportGraphTsconfigOptions } from "./import_graph.js";
import type {
  BundlerAssetManifest,
  BundlerCollectedAssetLinks,
  BundlerCollectAssetLinksOptions,
} from "./manifest.js";
import type { BundlerLogger } from "./logging.js";
import type { BundlerOutputLayoutOptions } from "./output_layout.js";
import type { BundlerPrecompressOptions, BundlerPrecompressStats } from "./precompression.js";
import type { BundlerBuildResult, BundlerOptions, BundlerWatchSession } from "./runtime.js";

type BundlerFrontendMode = "development" | "production";

type BundlerSsrModuleMapRuleOptions = {
  allowEmpty?: boolean;
  collapseIndex?: boolean;
  defaultExport?: boolean;
  exclude?: string[];
  include: string[];
  key: string;
  mapExport?: string;
  matchedModuleExportName?: string;
  requireMatchedModuleExport?: boolean;
  resolverExport?: string;
  rootExport?: string;
  rootModule?: string;
  rootModuleExportName?: string;
};

type BundlerFrontendAppBundlerConfigOptions = {
  browser?: Partial<BundlerOptions>;
  clientOutDir: string;
  define?: Record<string, string>;
  deferredClientEntryKey?: string;
  extraClientRules?: BundlerDiscoverRule[];
  extraSsrRules?: BundlerDiscoverRule[];
  frontendDir?: string;
  globalClientEntries?: string[];
  globalStyleExclude?: string[];
  globalStyleInclude?: string[];
  globalStyleRuleKey?: string;
  ignoredSourceInclude?: string[];
  logger?: BundlerLogger;
  minify?: boolean;
  mode?: BundlerFrontendMode;
  node?: Partial<BundlerOptions>;
  outputLayout?: BundlerOutputLayoutOptions;
  precompress?: BundlerPrecompressOptions;
  publicDir?: string | false;
  publicPath?: string;
  rootDir?: string;
  sourcemap?: BundlerOptions["sourcemap"];
  ssr?: BundlerSsrModuleMapRuleOptions | false;
  ssrOutDir?: string;
  stripComments?: boolean;
  supportedI18nLanguages?: readonly string[];
};

type BundlerFrontendAppBundlerConfig = {
  clientOptions: BundlerOptions;
  clientOutDir: string;
  deferredClientEntryKey: string;
  frontendDir: string;
  globalClientEntries: string[];
  globalStyleRuleKey: string;
  mode: BundlerFrontendMode;
  publicDir?: string;
  rootDir: string;
  ssr?: BundlerSsrModuleMapRuleOptions;
  ssrOptions?: BundlerOptions;
  ssrOutDir?: string;
};

type BundlerFrontendAppBundlerOptions = {
  client: BundlerOptions;
  config: BundlerFrontendAppBundlerConfig;
  ssr?: BundlerOptions;
};

type BundlerAggregateSourceIdOptions = {
  collapseIndex?: boolean;
  extensions?: readonly string[];
  sourcePrefix?: string;
};

type BundlerRelatedClientEntryMapOptions = {
  aggregateSources?: readonly string[];
  manifest?: BundlerAssetManifest | { assetManifest?: BundlerAssetManifest };
  pageId?: BundlerAggregateSourceIdOptions;
  rootDir?: string;
  ruleKey?: string;
  tsconfig?: BundlerImportGraphTsconfigOptions;
};

type BundlerFrontendAssetLinksOptions = {
  collect?: BundlerCollectAssetLinksOptions;
  globalEntryIds?: readonly string[];
  globalStyleRuleKey?: string;
  manifest: BundlerAssetManifest;
  pageIds?: readonly string[];
  renderTags?: boolean;
  relatedEntryMap?: Record<string, readonly string[]>;
};

type BundlerRenderedAssetTags = {
  html: string;
  scripts: string;
  styles: string;
};

type BundlerFrontendAssetLinks = BundlerCollectedAssetLinks & {
  tags?: BundlerRenderedAssetTags;
};

type BundlerSsrNodeModulesOptions = {
  force?: boolean;
  sourceDir?: string;
  strategy?: "copy" | "none" | "symlink";
  targetDir?: string;
};

type BundlerFrontendBuildOptions = BundlerFrontendAppBundlerConfigOptions & {
  nodeModules?: BundlerSsrNodeModulesOptions;
};

type BundlerFrontendBuildResult = {
  client: BundlerBuildResult;
  nodeModules?: { path: string; strategy: "copy" | "symlink" };
  publicDirCopied: boolean;
  relatedClientEntryMap: Record<string, string[]>;
  ssr?: BundlerBuildResult;
  ssrEntryOutput?: string;
  stats: {
    precompressed?: BundlerPrecompressStats;
  };
};

type BundlerFrontendRuntimeConfig = BundlerFrontendAppBundlerConfig & {
  clientManifestPath?: string;
  pageId?: BundlerAggregateSourceIdOptions;
  renderTags?: boolean;
  ssrManifestPath?: string;
  tsconfig?: BundlerImportGraphTsconfigOptions;
};

type BundlerFrontendRuntimeState = {
  client?: BundlerBuildResult;
  clientManifest?: BundlerAssetManifest;
  relatedClientEntryMap: Record<string, string[]>;
  ssr?: BundlerBuildResult;
  ssrManifest?: BundlerAssetManifest;
  ssrModule?: Record<string, unknown>;
};

type BundlerFrontendRuntime = {
  buildAssetLinks(pageIds?: readonly string[]): Promise<BundlerFrontendAssetLinks>;
  dispose(): Promise<void>;
  ensure(): Promise<BundlerFrontendRuntimeState>;
  getRuntime(): BundlerFrontendRuntimeState | undefined;
  resolvePageComponent(pageId: string): Promise<unknown>;
  resolveRootDocument(): Promise<unknown>;
};

type BundlerStaticAssetRequest = {
  headers?: Headers | IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  method?: string;
  path?: string;
  url?: string;
};

type BundlerStaticAssetResponse = {
  body?: Buffer;
  headers: Record<string, string>;
  status: number;
};

type BundlerStaticAssetDir = string | {
  dir: string;
  mountPath?: string;
};

type BundlerStaticAssetHandlerOptions = {
  blockPrivate?: boolean;
  blockSourceMaps?: boolean;
  clientOutDir: string;
  devCacheControl?: string;
  extraStaticDirs?: readonly BundlerStaticAssetDir[];
  immutableCacheControl?: string;
  mode?: BundlerFrontendMode;
  publicDir?: string;
};

type BundlerExpressLikeRequest = BundlerStaticAssetRequest;

type BundlerExpressLikeResponse = {
  end(body?: Buffer | string): void;
  setHeader(name: string, value: string): void;
  statusCode?: number;
};

type BundlerExpressLikeNext = (error?: unknown) => void;

type BundlerQuarantineResult = {
  dir: string;
  quarantineDir?: string;
  quarantined: boolean;
};

type BundlerSsrModuleMapRule = BundlerDiscoverAggregateRule;

export type {
  BundlerAggregateSourceIdOptions,
  BundlerExpressLikeNext,
  BundlerExpressLikeRequest,
  BundlerExpressLikeResponse,
  BundlerFrontendAppBundlerConfig,
  BundlerFrontendAppBundlerConfigOptions,
  BundlerFrontendAppBundlerOptions,
  BundlerFrontendAssetLinks,
  BundlerFrontendAssetLinksOptions,
  BundlerFrontendBuildOptions,
  BundlerFrontendBuildResult,
  BundlerFrontendMode,
  BundlerFrontendRuntime,
  BundlerFrontendRuntimeConfig,
  BundlerFrontendRuntimeState,
  BundlerQuarantineResult,
  BundlerRelatedClientEntryMapOptions,
  BundlerRenderedAssetTags,
  BundlerSsrModuleMapRule,
  BundlerSsrModuleMapRuleOptions,
  BundlerSsrNodeModulesOptions,
  BundlerStaticAssetDir,
  BundlerStaticAssetHandlerOptions,
  BundlerStaticAssetRequest,
  BundlerStaticAssetResponse,
  BundlerWatchSession,
  BundlerFrontendEntryRulesOptions,
};
