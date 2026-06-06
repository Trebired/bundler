import type { Metafile, Format } from "esbuild";
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

type BundlerDiscoverOptions = {
  dir: string;
  include?: string[];
  exclude?: string[];
  extensions?: string[];
  ignoreDirs?: string[];
  maxBundleSize?: number | string;
  namePrefix?: string;
};

type BundlerManifestOptions = boolean | {
  file?: string;
};

type BundlerVirtualEntries = Record<string, string>;
type BundlerMode = "debug" | "compact" | "extreme";
type BundlerEnvironment = "browser" | "node" | "neutral";

type BundlerEntrySource = "manual" | "discover" | "virtual";

type BundlerEntryRecord = {
  contents?: string;
  name: string;
  path: string;
  source: BundlerEntrySource;
  virtualLoader?: BundlerVirtualEntryLoader;
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

type BundlerResolvedEntriesInput = BundlerEntryRecord[] | Record<string, string>;

type BundlerAssetManifestEntry = {
  entryName?: string;
  entrySource?: string;
  file: string;
  entryOutput: string;
  outputs: string[];
  js: string[];
  css: string[];
  assets: string[];
  imports: string[];
};

type BundlerAssetManifestOutput = {
  output: string;
  kind: BundlerDerivedManifestOutputKind;
  entryName?: string;
  entrySource?: string;
  entryPoint?: string;
  inputs: string[];
  css: string[];
  imports: string[];
  bytes: number;
};

type BundlerAssetManifest = {
  entries: Record<string, BundlerAssetManifestEntry>;
  entryNames: Record<string, string>;
  entrySources: Record<string, string>;
  entryOutputs: Record<string, string>;
  outputs: Record<string, BundlerAssetManifestOutput>;
};

type BundlerBuildAssetManifestOptions = {
  metafile: Metafile;
  rootDir: string;
  outDir: string;
  resolvedEntries?: BundlerResolvedEntriesInput;
};

type BundlerCollectAssetLinksLookup = "auto" | "entryKey" | "entryName" | "entryOutput" | "entrySource";

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
  entries?: string[] | Record<string, string>;
  discover?: BundlerDiscoverOptions | BundlerDiscoverOptions[];
  virtualEntries?: BundlerVirtualEntries;
  outDir: string;
  rootDir?: string;
  mode?: BundlerMode;
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
  BundlerBuildAssetManifestOptions,
  BundlerBuildResult,
  BundlerCollectedAssetLinks,
  BundlerCollectAssetLinksLookup,
  BundlerCollectAssetLinksOptions,
  BundlerDiscoverOptions,
  BundlerDerivedManifest,
  BundlerDerivedManifestChunk,
  BundlerDerivedManifestEntry,
  BundlerDerivedManifestOutput,
  BundlerDerivedManifestOutputKind,
  BundlerEnvironment,
  BundlerEntryRecord,
  BundlerEntrySource,
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
  BundlerMode,
  BundlerOptions,
  BundlerResolvedEntriesInput,
  BundlerTsconfigPaths,
  BundlerVirtualEntries,
  BundlerVirtualEntryLoader,
  BundlerWatchSession,
  LoadedBundlerConfig,
  NormalizedBundlerLogger,
};
