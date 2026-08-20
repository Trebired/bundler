import { build as runEsbuild } from "esbuild";
import { logPackageInitialized } from "@package/logger-adapter";

import { BUNDLER_LOG_GROUP, BUNDLER_PACKAGE_NAME } from "#0e84q8f4ubat";
import { createDefaultBundlerLogger, resolveLogger } from "#dcx0jw9bw3ka";
import type { BundlerBuildResult, BundlerOptions } from "#3c8d8166992a";
import { createEsbuildOptions, normalizeBundlerOptions } from "./esbuild-options.js";
import { postProcessBuildOutput } from "./post-build.js";
import { resolveBundlerEntries } from "./discovery.js";
import { appendFrontendConfigStyleEntry, createEmptyResolvedDiscovery, prepareFrontendConfigStyles } from "./frontend-config.js";
import { cleanOutDir, formatFailure, logWarnings, toBuildResult } from "./shared.js";

type NormalizedBundlerOptions = ReturnType<typeof normalizeBundlerOptions>;

async function bundle(options: BundlerOptions): Promise<BundlerBuildResult> {
  const normalized = normalizeBundlerOptions(options || {} as BundlerOptions);
  const logger = resolveLogger(normalized.logger, normalized.loggerAdapter);

  logPackageInitialized({
      adapter: normalized.loggerAdapter,
      defaultLogger: createDefaultBundlerLogger,
      fallback: "console",
      groupPrefix: BUNDLER_LOG_GROUP,
      logger: normalized.logger,
      source: BUNDLER_PACKAGE_NAME,
  });

  if (normalized.clean) {
    logger.info("build", `clean :: ${normalized.outDir}`);
    await cleanOutDir(normalized.outDir);
  }

  logger.info("build", "start");
  const startedAt = Date.now();

  try {
    const resolvedDiscovery = await timeBuildStep(logger, "discovery", () => resolveBuildDiscovery(options, normalized, logger));
    logger.info("build", `entries :: count=${resolvedDiscovery.entries.length}`);
    const summary = await runBuild(normalized, logger, resolvedDiscovery, startedAt);
    logger.info("build", `complete :: outputs=${summary.outputs.length} warnings=${summary.warnings}`, {
        duration_ms: summary.durationMs,
    });
    return summary;
  } catch (error) {
    logger.fail("build", `failed :: ${formatFailure(error)}`);
    throw error;
  }
}

async function resolveBuildDiscovery(
  options: BundlerOptions,
  normalized: NormalizedBundlerOptions,
  logger: ReturnType<typeof resolveLogger>,
) {
  const frontendStyles = await prepareFrontendConfigStyles({
      environment: normalized.environment,
      logger,
      rootDir: normalized.rootDir,
  });
  const discoveredEntries = options?.discover || !frontendStyles
  ? await resolveBundlerEntries(options || {} as BundlerOptions, normalized.rootDir, {
      allowEmpty: Boolean(frontendStyles),
    }, {
      ignoredDirs: normalized.i18n.enabled ? [normalized.i18n.dirName] : [],
  })
  : createEmptyResolvedDiscovery();
  return appendFrontendConfigStyleEntry(discoveredEntries, frontendStyles);
}

async function runBuild(
  normalized: NormalizedBundlerOptions,
  logger: ReturnType<typeof resolveLogger>,
  resolvedDiscovery: Awaited<ReturnType<typeof resolveBuildDiscovery>>,
  startedAt: number,
): Promise<BundlerBuildResult> {
  const result = await timeBuildStep(logger, "esbuild", () => runEsbuild(createEsbuildOptions({
          ...normalized,
          entryRecords: resolvedDiscovery.entries,
        }, logger)));
  const postProcessed = await timeBuildStep(logger, "post-process", () => postProcessBuildOutput({ normalized, result }));
  logWarnings(logger, result.warnings);
  return await timeBuildStep(logger, "build result", () => toBuildResult({
        manifest: normalized.manifest,
        outDir: normalized.outDir,
        outputLayout: postProcessed.outputLayout,
        precompressed: postProcessed.precompressed,
        resolvedDiscovery,
        result,
        rootDir: normalized.rootDir,
        startedAt,
  }));
}

async function timeBuildStep<T>(
  logger: ReturnType<typeof resolveLogger>,
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const value = await run();
    logger.info("build", `${label} complete`, { took_ms: elapsedMs(startedAt) });
    return value;
  } catch (error) {
    logger.fail("build", `${label} failed`, {
        error: error instanceof Error ? error.message : String(error),
        took_ms: elapsedMs(startedAt),
    });
    throw error;
  }
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export { bundle };
