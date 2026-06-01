import path from "node:path";
import type { BuildOptions } from "esbuild";

import { createScssPlugin } from "../plugins/scss.js";
import { createSourceAnnotationsPlugin } from "../plugins/source-annotations.js";
import type { BundlerOptions, NormalizedBundlerLogger } from "../types.js";

type NormalizedBundlerOptions = {
  annotateSources: boolean;
  clean: boolean;
  define?: Record<string, string>;
  entries: string[] | Record<string, string>;
  external?: string[];
  format?: BundlerOptions["format"];
  logger?: BundlerOptions["logger"];
  loggerAdapter?: BundlerOptions["loggerAdapter"];
  minify: boolean;
  outDir: string;
  platform?: BundlerOptions["platform"];
  publicPath?: string;
  rootDir: string;
  sourcemap?: BundlerOptions["sourcemap"];
  splitting: boolean;
  target?: string | string[];
};

function normalizeEntries(entries: BundlerOptions["entries"]): BundlerOptions["entries"] {
  if (Array.isArray(entries)) {
    const filtered = entries.map((value) => String(value || "").trim()).filter(Boolean);
    if (!filtered.length) {
      throw new Error("bundler-missing-entries");
    }
    return filtered;
  }

  if (!entries || typeof entries !== "object") {
    throw new Error("bundler-missing-entries");
  }

  const normalized = Object.fromEntries(
    Object.entries(entries)
      .map(([key, value]) => [String(key || "").trim(), String(value || "").trim()])
      .filter(([key, value]) => Boolean(key && value)),
  );

  if (Object.keys(normalized).length === 0) {
    throw new Error("bundler-missing-entries");
  }

  return normalized;
}

function normalizeBundlerOptions(options: BundlerOptions): NormalizedBundlerOptions {
  const rootDir = path.resolve(String(options.rootDir || "").trim() || process.cwd());
  const outDir = String(options.outDir || "").trim();

  if (!outDir) {
    throw new Error("bundler-missing-out-dir");
  }

  const resolvedOutDir = path.resolve(rootDir, outDir);
  const entries = normalizeEntries(options.entries);

  return {
    annotateSources: Boolean(options.annotateSources),
    clean: options.clean !== false,
    define: options.define,
    entries,
    external: options.external,
    format: options.format,
    logger: options.logger,
    loggerAdapter: options.loggerAdapter,
    minify: Boolean(options.minify),
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
  if (options.annotateSources) {
    logger.info("annotate", "inline source annotations enabled");
  }

  logger.info("scss", "scss compiler enabled");

  return {
    absWorkingDir: options.rootDir,
    bundle: true,
    define: options.define,
    entryPoints: options.entries,
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
