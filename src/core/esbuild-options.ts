import path from "node:path";
import type { BuildOptions } from "esbuild";

import { createScssPlugin } from "../plugins/scss.js";
import { createClassNameMap } from "../plugins/obfuscation.js";
import { createSourceAnnotationsPlugin } from "../plugins/source-annotations.js";
import { createVirtualEntriesPlugin } from "../plugins/virtual-entries.js";
import type {
  BundlerEntryRecord,
  BundlerMode,
  BundlerObfuscationOptions,
  BundlerOptions,
  NormalizedBundlerLogger,
} from "../types.js";
import { normalizeManifestOptions, toEntryPointMap } from "./discovery.js";

type NormalizedBundlerObfuscationOptions = {
  assetNames?: string;
  chunkNames?: string;
  enabled: boolean;
  entryNames?: string;
  keepNames?: boolean;
  mangleProps?: RegExp;
  mangleQuoted?: boolean;
};

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
  mode: BundlerMode;
  obfuscate: NormalizedBundlerObfuscationOptions;
  onEntrySetChanged?: BundlerOptions["onEntrySetChanged"];
  onRebuilt?: BundlerOptions["onRebuilt"];
  outDir: string;
  platform?: BundlerOptions["platform"];
  publicPath?: string;
  rootDir: string;
  sourcemap?: BundlerOptions["sourcemap"];
  splitting: boolean;
  stripComments: boolean;
  target?: string | string[];
};

type ResolvedModeDefaults = {
  minify: boolean;
  obfuscate: BundlerObfuscationOptions | undefined;
  stripComments: boolean;
};

function resolveModeDefaults(mode: BundlerMode): ResolvedModeDefaults {
  if (mode === "debug") {
    return {
      minify: false,
      obfuscate: undefined,
      stripComments: false,
    };
  }

  if (mode === "extreme") {
    return {
      minify: true,
      obfuscate: true,
      stripComments: true,
    };
  }

  return {
    minify: true,
    obfuscate: undefined,
    stripComments: true,
  };
}

function toRegExp(value: RegExp | string | undefined): RegExp | undefined {
  if (!value) return undefined;
  return value instanceof RegExp ? value : new RegExp(value);
}

function normalizeObfuscation(options: BundlerObfuscationOptions | undefined): NormalizedBundlerObfuscationOptions {
  if (!options) {
    return { enabled: false };
  }

  if (options === true) {
    return {
      assetNames: "[hash]",
      chunkNames: "[hash]",
      enabled: true,
      entryNames: "[hash]",
      keepNames: false,
    };
  }

  return {
    assetNames: String(options.assetNames || "").trim() || "[hash]",
    chunkNames: String(options.chunkNames || "").trim() || "[hash]",
    enabled: true,
    entryNames: String(options.entryNames || "").trim() || "[hash]",
    keepNames: options.keepNames,
    mangleProps: toRegExp(options.mangleProps),
    mangleQuoted: options.mangleQuoted,
  };
}

function normalizeBundlerOptions(options: BundlerOptions): NormalizedBundlerOptions {
  const rootDir = path.resolve(String(options.rootDir || "").trim() || process.cwd());
  const outDir = String(options.outDir || "").trim();
  const mode = options.mode || "compact";
  const defaults = resolveModeDefaults(mode);

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
    minify: options.minify ?? defaults.minify,
    mode,
    obfuscate: normalizeObfuscation(options.obfuscate ?? defaults.obfuscate),
    onEntrySetChanged: options.onEntrySetChanged,
    onRebuilt: options.onRebuilt,
    outDir: resolvedOutDir,
    platform: options.platform,
    publicPath: options.publicPath,
    rootDir,
    sourcemap: options.sourcemap,
    splitting: Boolean(options.splitting),
    stripComments: options.stripComments ?? defaults.stripComments,
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

  logger.info("build", `mode :: ${options.mode}`);

  if (options.minify) {
    logger.info("build", "minify enabled");
  }

  if (options.stripComments && !options.annotateSources) {
    logger.info("build", "comment stripping enabled");
  }

  if (options.obfuscate.enabled) {
    logger.info("build", "obfuscation enabled");
  }

  logger.info("scss", "scss compiler enabled");
  const classNameMap = options.obfuscate.enabled ? createClassNameMap(options.rootDir) : undefined;

  if (classNameMap && classNameMap.size > 0) {
    logger.info("build", `class-obfuscation :: count=${classNameMap.size}`);
  }

  return {
    absWorkingDir: options.rootDir,
    assetNames: options.obfuscate.enabled ? options.obfuscate.assetNames : undefined,
    bundle: true,
    chunkNames: options.obfuscate.enabled ? options.obfuscate.chunkNames : undefined,
    define: options.define,
    entryPoints,
    entryNames: options.obfuscate.enabled ? options.obfuscate.entryNames : undefined,
    external: options.external,
    format: options.format,
    keepNames: options.obfuscate.enabled ? options.obfuscate.keepNames : undefined,
    legalComments: options.annotateSources ? "inline" : options.stripComments ? "none" : undefined,
    logLevel: "silent",
    mangleProps: options.obfuscate.enabled ? options.obfuscate.mangleProps : undefined,
    mangleQuoted: options.obfuscate.enabled ? options.obfuscate.mangleQuoted : undefined,
    metafile: true,
    minify: options.minify,
    outbase: options.rootDir,
    outdir: options.outDir,
    platform: options.platform,
    plugins: [
      createVirtualEntriesPlugin({
        classNameMap,
        entries: options.entryRecords || [],
        logger,
        rootDir: options.rootDir,
      }),
      createScssPlugin({
        annotateSources: options.annotateSources,
        classNameMap,
        logger,
        rootDir: options.rootDir,
        sourcemapEnabled: Boolean(options.sourcemap),
      }),
      ...((options.annotateSources || (classNameMap && classNameMap.size > 0)) ? [
        createSourceAnnotationsPlugin({
          annotateSources: options.annotateSources,
          classNameMap,
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
