import type { Format, Loader, Metafile } from "esbuild";
import type { ResultLike } from "@package/result";

import type { BundlerResolvedDiscovery } from "./discovery.js";
import type { BundlerI18nOptions } from "./i18n.js";
import type { BundlerLogger, BundlerLoggerAdapter } from "./logging.js";
import type { BundlerAssetManifest, BundlerManifestOptions } from "./manifest.js";
import type { BundlerOutputLayoutOptions, BundlerOutputLayoutStats } from "./output_layout.js";
import type { BundlerPrecompressOptions, BundlerPrecompressStats } from "./precompression.js";

type BundlerEnvironment = "browser" | "node" | "neutral";

type BundlerOptions = {
  discover: import("./discovery.js").BundlerDiscoverOptions | import("./discovery.js").BundlerDiscoverOptions[];
  outDir: string;
  rootDir?: string;
  environment?: BundlerEnvironment;
  format?: Format;
  target?: string | string[];
  minify?: boolean;
  stripComments?: boolean;
  sourcemap?: boolean | "inline" | "external";
  splitting?: boolean;
  publicPath?: string;
  loader?: Record<string, Loader>;
  outputLayout?: BundlerOutputLayoutOptions;
  precompress?: BundlerPrecompressOptions;
  external?: string[];
  define?: Record<string, string>;
  clean?: boolean;
  annotateSources?: boolean;
  i18n?: boolean | BundlerI18nOptions;
  manifest?: BundlerManifestOptions;
  onRebuilt?: (result: BundlerBuildResult) => void |Promise<void>;
  onEntrySetChanged?: (entries: Record<string, string>) => void |Promise<void>;
  logger?: BundlerLogger;
  loggerAdapter?: BundlerLoggerAdapter;
};

type BundlerBuildResult = {
  entries: Record<string, string>;
  outputs: string[];
  warnings: number;
  metafile?: Metafile;
  assetManifest?: BundlerAssetManifest;
  outputLayout?: BundlerOutputLayoutStats;
  precompressed?: BundlerPrecompressStats;
  manifestPath?: string;
  durationMs: number;
  resolvedDiscovery: BundlerResolvedDiscovery;
  result?: ResultLike<{
    durationMs: number;
    outputs: string[];
    warnings: number;
  }>;
};

type BundlerWatchSession = {
  rebuild(): Promise<BundlerBuildResult>;
  dispose(): Promise<void>;
};

type LoadedBundlerConfig = {
  config: BundlerOptions;
  configPath: string;
};

type BundlerProjectBuildConfig = {
  annotateSources?: boolean;
  loader?: Record<string, Loader>;
  minify?: boolean;
  outputLayout?: BundlerOutputLayoutOptions;
  precompress?: BundlerPrecompressOptions;
  publicPath?: string;
  sourcemap?: BundlerOptions["sourcemap"];
  stripComments?: boolean;
};

type BundlerProjectFrontendConfig = {
  deferredClientEntryKey?: string;
  frontendDir?: string;
  globalClientEntryExclude?: string[];
  globalClientEntryInclude?: string[];
  globalStyleExclude?: string[];
  globalStyleInclude?: string[];
  globalStyleRuleKey?: string;
  ignoredSourceInclude?: string[];
  publicDir?: string | false;
};

type BundlerProjectStaticAssetsConfig = {
  blockPrivate?: boolean;
  blockSourceMaps?: boolean;
  devCacheControl?: string;
  immutableCacheControl?: string;
};

type BundlerProjectConfig = {
  build?: BundlerProjectBuildConfig;
  forVersion?: string;
  frontend?: BundlerProjectFrontendConfig;
  i18n?: boolean | BundlerI18nOptions;
  prefix?: string | false;
  staticAssets?: BundlerProjectStaticAssetsConfig;
};

type NormalizedBundlerProjectConfig = {
  build: BundlerProjectBuildConfig;
  forVersion: string;
  frontend: BundlerProjectFrontendConfig;
  i18n?: boolean | BundlerI18nOptions;
  prefix: string;
  staticAssets: BundlerProjectStaticAssetsConfig;
};

type LoadedBundlerProjectConfig = {
  config: NormalizedBundlerProjectConfig;
  configPath: string | null;
  dependencies: string[];
};

type BundlerNamespaceValue = string | number | boolean;

type BundlerDataAttrsInput = Record<string, BundlerNamespaceValue|null|undefined>;

type BundlerDataAttrsOutput = Record<string, BundlerNamespaceValue|null|undefined>;

type BundlerNamespace = {
  className(name: string): string;
  cssVar(name: string): string;
  cssVarRef(name: string, fallback?: string): string;
  dataAttr(name: string): string;
  dataAttrs(input: BundlerDataAttrsInput): BundlerDataAttrsOutput;
  dataSelector(name: string, value?: BundlerNamespaceValue): string;
  elementClass(block: string, element: string): string;
  eventName(name: string): string;
  modifierClass(block: string, modifier: string): string;
  prefix: string;
  token(name: string): string;
};

export type {
  BundlerBuildResult,
  BundlerEnvironment,
  BundlerDataAttrsInput,
  BundlerDataAttrsOutput,
  BundlerOptions,
  BundlerNamespace,
  BundlerNamespaceValue,
  BundlerProjectBuildConfig,
  BundlerProjectConfig,
  BundlerProjectFrontendConfig,
  BundlerProjectStaticAssetsConfig,
  BundlerWatchSession,
  LoadedBundlerConfig,
  LoadedBundlerProjectConfig,
  NormalizedBundlerProjectConfig,
};
