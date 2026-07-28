import type { Format, Metafile } from "esbuild";
import type { ResultLike } from "@package/result";

import type { BundlerResolvedDiscovery } from "./discovery.js";
import type { BundlerI18nOptions } from "./i18n.js";
import type { BundlerLogger, BundlerLoggerAdapter } from "./logging.js";
import type { BundlerAssetManifest, BundlerManifestOptions } from "./manifest.js";

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
  external?: string[];
  define?: Record<string, string>;
  clean?: boolean;
  annotateSources?: boolean;
  i18n?: boolean | BundlerI18nOptions;
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

export type {
  BundlerBuildResult,
  BundlerEnvironment,
  BundlerOptions,
  BundlerWatchSession,
  LoadedBundlerConfig,
};
