import path from "node:path";
import type { BuildOptions } from "esbuild";

import { createScssPlugin } from "#751yrciipoz0";
import { createSourceAnnotationsPlugin } from "#ulrbecj1la7z";
import { createVirtualEntriesPlugin } from "#18o0cf9c108j";
import type {
  BundlerEntryRecord,
  BundlerOptions,
  NormalizedBundlerLogger,
} from "#jb343639kom2";
import { normalizeManifestOptions, toEntryPointMap } from "./discovery.js";

type NormalizedBundlerOptions = {
  annotateSources: boolean;
  clean: boolean;
  define?: Record<string, string>;
  environment?: BundlerOptions["environment"];
  entryRecords?: BundlerEntryRecord[];
  external?: string[];
  format?: BundlerOptions["format"];
  logger?: BundlerOptions["logger"];
  loggerAdapter?: BundlerOptions["loggerAdapter"];
  manifest: ReturnType<typeof normalizeManifestOptions>;
  minify: boolean;
  onEntrySetChanged?: BundlerOptions["onEntrySetChanged"];
  onRebuilt?: BundlerOptions["onRebuilt"];
  outDir: string;
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
    logger: options.logger,
    loggerAdapter: options.loggerAdapter,
    manifest: normalizeManifestOptions(options.manifest),
    minify: Boolean(options.minify),
    onEntrySetChanged: options.onEntrySetChanged,
    onRebuilt: options.onRebuilt,
    outDir: resolvedOutDir,
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
  if (options.minify) logger.info("build", "minify enabled");
  if (options.stripComments && !options.annotateSources) logger.info("build", "comment stripping enabled");
  logger.info("scss", "scss compiler enabled");
}

function createPlugins(
  options: NormalizedBundlerOptions,
  logger: NormalizedBundlerLogger,
): NonNullable<BuildOptions["plugins"]> {
  return [
    createVirtualEntriesPlugin({
      entries: options.entryRecords || [],
      logger,
      rootDir: options.rootDir,
    }),
    createScssPlugin({
      annotateSources: options.annotateSources,
      logger,
      rootDir: options.rootDir,
      sourcemapEnabled: Boolean(options.sourcemap),
    }),
    ...(options.annotateSources ? [createSourceAnnotationsPlugin({ logger, rootDir: options.rootDir })] : []),
  ];
}

export { createEsbuildOptions, normalizeBundlerOptions };
export type { NormalizedBundlerOptions };
