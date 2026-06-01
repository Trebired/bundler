import path from "node:path";
import type { BuildOptions } from "esbuild";

import { createScssPlugin } from "../plugins/scss.js";
import { createSourceAnnotationsPlugin } from "../plugins/source-annotations.js";
import { createVirtualEntriesPlugin } from "../plugins/virtual-entries.js";
import type { BundlerOptions, BundlerEntryRecord, NormalizedBundlerLogger } from "../types.js";
import { normalizeManifestOptions, toEntryPointMap } from "./discovery.js";

type NormalizedBundlerOptions = {
  annotateSources: boolean;
  clean: boolean;
  define?: Record<string, string>;
  entries?: string[] | Record<string, string>;
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
  platform?: BundlerOptions["platform"];
  publicPath?: string;
  rootDir: string;
  sourcemap?: BundlerOptions["sourcemap"];
  splitting: boolean;
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
    entries: options.entries,
    external: options.external,
    format: options.format,
    logger: options.logger,
    loggerAdapter: options.loggerAdapter,
    manifest: normalizeManifestOptions(options.manifest),
    minify: Boolean(options.minify),
    onEntrySetChanged: options.onEntrySetChanged,
    onRebuilt: options.onRebuilt,
    outDir: resolvedOutDir,
    platform: options.platform,
    publicPath: options.publicPath,
    rootDir,
    sourcemap: options.sourcemap,
    splitting: Boolean(options.splitting),
    target: options.target,
  };
}

function createEsbuildOptions(
  options: NormalizedBundlerOptions,
  logger: NormalizedBundlerLogger,
): BuildOptions {
  const entryPoints = options.entryRecords
    ? toEntryPointMap(options.entryRecords, options.rootDir)
    : options.entries;

  if (!entryPoints || (typeof entryPoints === "object" && !Array.isArray(entryPoints) && Object.keys(entryPoints).length === 0)) {
    throw new Error("bundler-missing-entries");
  }

  if (options.annotateSources) {
    logger.info("annotate", "inline source annotations enabled");
  }

  logger.info("scss", "scss compiler enabled");

  return {
    absWorkingDir: options.rootDir,
    bundle: true,
    define: options.define,
    entryPoints,
    external: options.external,
    format: options.format,
    legalComments: options.annotateSources ? "inline" : undefined,
    logLevel: "silent",
    metafile: true,
    minify: options.minify,
    outbase: options.rootDir,
    outdir: options.outDir,
    platform: options.platform,
    plugins: [
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
      ...(options.annotateSources ? [
        createSourceAnnotationsPlugin({
          logger,
          rootDir: options.rootDir,
        }),
      ] : []),
    ],
    publicPath: options.publicPath,
    sourcemap: options.sourcemap,
    splitting: options.splitting,
    target: options.target,
    write: true,
  };
}

export { createEsbuildOptions, normalizeBundlerOptions };
export type { NormalizedBundlerOptions };
