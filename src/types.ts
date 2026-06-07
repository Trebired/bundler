import type { Format, Metafile } from "esbuild";
import type {
  LoggerAdapterEvent,
  LoggerAdapterGenericLogMethod,
  LoggerAdapterLogger,
  LoggerAdapterLogMethod,
  LoggerAdapterWriter,
  NormalizedLoggerAdapter,
} from "@trebired/logger-adapter";

type BundlerLogger = LoggerAdapterLogger;
type BundlerLoggerAdapter = LoggerAdapterWriter;
type BundlerLogMethod = LoggerAdapterLogMethod;
type BundlerGenericLogMethod = LoggerAdapterGenericLogMethod;
type BundlerLogEvent = LoggerAdapterEvent;
type NormalizedBundlerLogger = NormalizedLoggerAdapter;

type BundlerVirtualEntryLoader = "css" | "ts";
type BundlerDiscoverRuleStrategy = "entry" | "bundle" | "ignore";
type BundlerEntryKind = "entry" | "bundle";
type BundlerEntrySource = "discover" | "internal";

type BundlerDiscoverRule = {
  key: string;
  include: string[];
  exclude?: string[];
  strategy: BundlerDiscoverRuleStrategy;
  maxBundleSize?: number | string;
};

type BundlerDiscoverOptions = {
  dir: string;
  rules: BundlerDiscoverRule[];
  ignoreDirs?: string[];
};

type BundlerManifestOptions = boolean | {
  file?: string;
};

type BundlerEnvironment = "browser" | "node" | "neutral";

type BundlerEntryRecord = {
  contents?: string;
  entrySource?: string;
  key: string;
  kind: BundlerEntryKind;
  name: string;
  ownedSources: string[];
  path: string;
  ruleKey: string;
  source: BundlerEntrySource;
  strategy: Exclude<BundlerDiscoverRuleStrategy, "ignore">;
  virtualLoader?: BundlerVirtualEntryLoader;
};

type BundlerResolvedRule = {
  entryKeys: string[];
  ignoredSources: string[];
  ruleKey: string;
  strategy: BundlerDiscoverRuleStrategy;
};

type BundlerResolvedDiscovery = {
  entries: BundlerEntryRecord[];
  rules: Record<string, BundlerResolvedRule>;
  sourceOwners: Record<string, string>;
};

type BundlerDerivedManifestEntry = {
  entryOutput: string;
  entryName?: string;
  inputs: string[];
  js: string[];
  css: string[];
  imports: string[];
};

type BundlerDerivedManifestChunk = {
  output: string;
  inputs: string[];
  css: string[];
  imports: string[];
};

type BundlerDerivedManifestOutputKind = "asset" | "chunk" | "entry";

type BundlerDerivedManifestOutput = {
  output: string;
  kind: BundlerDerivedManifestOutputKind;
  entryPoint?: string;
  entryName?: string;
  inputs: string[];
  css: string[];
  imports: string[];
  bytes: number;
};

type BundlerDerivedManifest = {
  entries: Record<string, BundlerDerivedManifestEntry>;
  chunks: Record<string, BundlerDerivedManifestChunk>;
  allOutputs: Record<string, BundlerDerivedManifestOutput>;
};

type BundlerAssetManifestEntry = {
  assets: string[];
  css: string[];
  entryOutput: string;
  entrySource?: string;
  file: string;
  imports: string[];
  js: string[];
  key: string;
  kind: BundlerEntryKind;
  outputs: string[];
  ruleKey: string;
  sources: string[];
  strategy: Exclude<BundlerDiscoverRuleStrategy, "ignore">;
};

type BundlerAssetManifestSource = {
  entryKey: string;
  outputs: string[];
  ruleKey: string;
  source: string;
  strategy: Exclude<BundlerDiscoverRuleStrategy, "ignore">;
};

type BundlerAssetManifestRule = {
  entryKeys: string[];
  ignoredSources: string[];
  ruleKey: string;
  strategy: BundlerDiscoverRuleStrategy;
};

type BundlerAssetManifestOutput = {
  bytes: number;
  css: string[];
  entryKey?: string;
  entryPoint?: string;
  imports: string[];
  inputs: string[];
  kind: BundlerDerivedManifestOutputKind;
  output: string;
  ruleKey?: string;
  strategy?: Exclude<BundlerDiscoverRuleStrategy, "ignore">;
};

type BundlerAssetManifest = {
  entries: Record<string, BundlerAssetManifestEntry>;
  entryOutputs: Record<string, string>;
  outputs: Record<string, BundlerAssetManifestOutput>;
  rules: Record<string, BundlerAssetManifestRule>;
  sources: Record<string, BundlerAssetManifestSource>;
};

type BundlerBuildAssetManifestOptions = {
  metafile: Metafile;
  resolvedDiscovery?: BundlerResolvedDiscovery;
  rootDir: string;
  outDir: string;
};

type BundlerCollectAssetLinksLookup = "auto" | "entryKey" | "entryOutput" | "source";

type BundlerCollectAssetLinksOptions = {
  from?: BundlerCollectAssetLinksLookup;
  publicPath?: string;
};

type BundlerCollectedAssetLinks = {
  entryKeys: string[];
  scripts: string[];
  styles: string[];
  assets: string[];
  outputs: string[];
  missing: string[];
};

type BundlerTsconfigPaths = Record<string, string[]>;

type BundlerImportGraphTsconfigOptions = boolean | string | {
  file?: string;
  baseUrl?: string;
  paths?: BundlerTsconfigPaths;
};

type BundlerImportGraphImportKind = "dynamic-import" | "export-from" | "import";

type BundlerImportGraphImport = {
  specifier: string;
  kind: BundlerImportGraphImportKind;
  resolved?: string;
  external: boolean;
};

type BundlerImportGraphFile = {
  path: string;
  imports: BundlerImportGraphImport[];
};

type BundlerImportGraph = {
  entries: string[];
  files: Record<string, BundlerImportGraphFile>;
};

type BundlerImportGraphOptions = {
  entries: string | string[];
  rootDir?: string;
  extensions?: string[];
  tsconfig?: BundlerImportGraphTsconfigOptions;
};

type BundlerOptions = {
  discover: BundlerDiscoverOptions | BundlerDiscoverOptions[];
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
  external?: string[];
  define?: Record<string, string>;
  clean?: boolean;
  annotateSources?: boolean;
  manifest?: BundlerManifestOptions;
  onRebuilt?: (result: BundlerBuildResult) => void | Promise<void>;
  onEntrySetChanged?: (entries: Record<string, string>) => void | Promise<void>;
  logger?: BundlerLogger;
  loggerAdapter?: BundlerLoggerAdapter;
};

type BundlerBuildResult = {
  entries: Record<string, string>;
  outputs: string[];
  warnings: number;
  metafile?: Metafile;
  assetManifest?: BundlerAssetManifest;
  manifestPath?: string;
  durationMs: number;
  resolvedDiscovery: BundlerResolvedDiscovery;
};

type BundlerWatchSession = {
  rebuild(): Promise<BundlerBuildResult>;
  dispose(): Promise<void>;
};

type LoadedBundlerConfig = {
  config: BundlerOptions;
  configPath: string;
};

export type {
  BundlerAssetManifest,
  BundlerAssetManifestEntry,
  BundlerAssetManifestOutput,
  BundlerAssetManifestRule,
  BundlerAssetManifestSource,
  BundlerBuildAssetManifestOptions,
  BundlerBuildResult,
  BundlerCollectedAssetLinks,
  BundlerCollectAssetLinksLookup,
  BundlerCollectAssetLinksOptions,
  BundlerDerivedManifest,
  BundlerDerivedManifestChunk,
  BundlerDerivedManifestEntry,
  BundlerDerivedManifestOutput,
  BundlerDerivedManifestOutputKind,
  BundlerDiscoverOptions,
  BundlerDiscoverRule,
  BundlerDiscoverRuleStrategy,
  BundlerEntryKind,
  BundlerEntryRecord,
  BundlerEntrySource,
  BundlerEnvironment,
  BundlerGenericLogMethod,
  BundlerImportGraph,
  BundlerImportGraphFile,
  BundlerImportGraphImport,
  BundlerImportGraphImportKind,
  BundlerImportGraphOptions,
  BundlerImportGraphTsconfigOptions,
  BundlerLogEvent,
  BundlerLogger,
  BundlerLoggerAdapter,
  BundlerLogMethod,
  BundlerManifestOptions,
  BundlerOptions,
  BundlerResolvedDiscovery,
  BundlerResolvedRule,
  BundlerTsconfigPaths,
  BundlerVirtualEntryLoader,
  BundlerWatchSession,
  LoadedBundlerConfig,
  NormalizedBundlerLogger,
};
