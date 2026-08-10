import path from "node:path";
import type { BuildOptions, Loader } from "esbuild";

import { createFrontendConfigStylesPlugin } from "#txn6vz7y3qut";
import { createScssPlugin } from "#751yrciipoz0";
import { createI18nPlugin } from "#m42z8fvtvpjc";
import { createSourceAnnotationsPlugin } from "#ulrbecj1la7z";
import { createVirtualEntriesPlugin } from "#18o0cf9c108j";
import type {
  BundlerEntryRecord,
  BundlerOptions,
  NormalizedBundlerI18nOptions,
  NormalizedBundlerLogger,
} from "#3c8d8166992a";
import { normalizeBundlerI18nOptions } from "./i18n-options.js";
import { normalizeBundlerOutputLayoutOptions } from "./output-layout.js";
import { normalizeBundlerPrecompressOptions } from "./precompression.js";
import { normalizeManifestOptions, toEntryPointMap } from "./discovery.js";
import type { NormalizedBundlerOutputLayoutOptions } from "./output-layout.js";
import type { NormalizedBundlerPrecompressOptions } from "./precompression.js";

type NormalizedBundlerOptions = {
  annotateSources: boolean;
  clean: boolean;
  define?: Record<string, string>;
  environment?: BundlerOptions["environment"];
  entryRecords?: BundlerEntryRecord[];
  external?: string[];
  format?: BundlerOptions["format"];
  i18n: NormalizedBundlerI18nOptions;
  loader: Record<string, Loader>;
  logger?: BundlerOptions["logger"];
  loggerAdapter?: BundlerOptions["loggerAdapter"];
  manifest: ReturnType<typeof normalizeManifestOptions>;
  minify: boolean;
  onEntrySetChanged?: BundlerOptions["onEntrySetChanged"];
  onRebuilt?: BundlerOptions["onRebuilt"];
  outDir: string;
  outputLayout: NormalizedBundlerOutputLayoutOptions;
  precompress: NormalizedBundlerPrecompressOptions;
  publicPath?: string;
  rootDir: string;
  sourcemap?: BundlerOptions["sourcemap"];
  splitting: boolean;
  stripComments: boolean;
  target?: string | string[];
};

function normalizeBundlerOptions(options: BundlerOptions): NormalizedBundlerOptions {
  const rootDir = path.resolve(String(options.rootDir || "").trim() || process.cwd());
  const outDir = String(options.outDir || "").trim();

  if (!outDir) {
    throw new Error("bundler-missing-out-dir");
  }

  const resolvedOutDir = path.resolve(rootDir, outDir);
  return {
    annotateSources: Boolean(options.annotateSources),
    clean: options.clean !== false,
    define: options.define,
    environment: options.environment,
    external: options.external,
    format: options.format,
    i18n: normalizeBundlerI18nOptions(options.i18n),
    loader: { ...DEFAULT_ASSET_LOADERS, ...(options.loader || {}) },
    logger: options.logger,
    loggerAdapter: options.loggerAdapter,
    manifest: normalizeManifestOptions(options.manifest),
    minify: Boolean(options.minify),
    onEntrySetChanged: options.onEntrySetChanged,
    onRebuilt: options.onRebuilt,
    outDir: resolvedOutDir,
    outputLayout: normalizeBundlerOutputLayoutOptions(options.outputLayout),
    precompress: normalizeBundlerPrecompressOptions(options.precompress),
    publicPath: options.publicPath,
    rootDir,
    sourcemap: options.sourcemap,
    splitting: Boolean(options.splitting),
    stripComments: Boolean(options.stripComments),
    target: options.target,
  };
}

function createEsbuildOptions(
  options: NormalizedBundlerOptions,
  logger: NormalizedBundlerLogger,
): BuildOptions {
  const entryPoints = resolveEntryPoints(options);
  logEsbuildOptions(logger, options);

  return {
    absWorkingDir: options.rootDir,
    bundle: true,
    define: options.define,
    entryPoints,
    external: options.external,
    format: options.format,
    legalComments: options.annotateSources ? "inline" : options.stripComments ? "none" : undefined,
    loader: options.loader,
    logLevel: "silent",
    metafile: true,
    minify: options.minify,
    outbase: options.rootDir,
    outdir: options.outDir,
    plugins: createPlugins(options, logger),
    publicPath: options.publicPath,
    sourcemap: options.sourcemap,
    splitting: options.splitting,
    target: options.target,
    write: true,
    platform: options.environment,
  };
}

function resolveEntryPoints(options: NormalizedBundlerOptions): Record<string, string> {
  const entryPoints = options.entryRecords ? toEntryPointMap(options.entryRecords, options.rootDir) : undefined;
  if (!entryPoints || Object.keys(entryPoints).length === 0) {
    throw new Error("bundler-missing-entries");
  }
  return entryPoints;
}

function logEsbuildOptions(logger: NormalizedBundlerLogger, options: NormalizedBundlerOptions): void {
  if (options.annotateSources) logger.info("annotate", "inline source annotations enabled");
  if (options.i18n.enabled) logger.info("i18n", "colocated local translators enabled");
  if (options.minify) logger.info("build", "minify enabled");
  if (options.stripComments && !options.annotateSources) logger.info("build", "comment stripping enabled");
  logger.info("scss", "scss compiler enabled");
}

function createPlugins(
  options: NormalizedBundlerOptions,
  logger: NormalizedBundlerLogger,
): NonNullable<BuildOptions["plugins"]> {
  return [
    createFrontendConfigStylesPlugin({
      annotateSources: options.annotateSources,
      logger,
      rootDir: options.rootDir,
      sourcemapEnabled: Boolean(options.sourcemap),
    }),
    createVirtualEntriesPlugin({
      entries: options.entryRecords || [],
      logger,
      rootDir: options.rootDir,
    }),
    ...(options.i18n.enabled ? [createI18nPlugin({
      annotateSources: options.annotateSources,
      i18n: options.i18n,
      logger,
      rootDir: options.rootDir,
    })] : []),
    createScssPlugin({
      annotateSources: options.annotateSources,
      logger,
      rootDir: options.rootDir,
      sourcemapEnabled: Boolean(options.sourcemap),
    }),
    ...(options.annotateSources ? [createSourceAnnotationsPlugin({ logger, rootDir: options.rootDir })] : []),
  ];
}

const DEFAULT_ASSET_LOADERS: Record<string, Loader> = {
  ".avif": "file",
  ".eot": "file",
  ".gif": "file",
  ".jpg": "file",
  ".jpeg": "file",
  ".otf": "file",
  ".png": "file",
  ".svg": "file",
  ".ttf": "file",
  ".webp": "file",
  ".woff": "file",
  ".woff2": "file",
};

export { createEsbuildOptions, normalizeBundlerOptions };
export type { NormalizedBundlerOptions };
