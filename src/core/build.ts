import { build as runEsbuild } from "esbuild";
import { logPackageInitialized } from "@package/logger-adapter";

import { BUNDLER_LOG_GROUP, BUNDLER_PACKAGE_NAME } from "#0e84q8f4ubat";
import { resolveLogger } from "#dcx0jw9bw3ka";
import type { BundlerBuildResult, BundlerOptions } from "#3c8d8166992a";
import { createEsbuildOptions, normalizeBundlerOptions } from "./esbuild-options.js";
import { postProcessBuildOutput } from "./post-build.js";
import { resolveBundlerEntries } from "./discovery.js";
import { appendFrontendConfigStyleEntry, createEmptyResolvedDiscovery, prepareFrontendConfigStyles } from "./frontend-config.js";
import { cleanOutDir, formatFailure, logWarnings, toBuildResult } from "./shared.js";

async function bundle(options: BundlerOptions): Promise<BundlerBuildResult> {
  const normalized = normalizeBundlerOptions(options || {} as BundlerOptions);
  const logger = resolveLogger(normalized.logger, normalized.loggerAdapter);

  logPackageInitialized({
    adapter: normalized.loggerAdapter,
    fallback: "console",
    group: BUNDLER_LOG_GROUP,
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
    const resolvedDiscovery = appendFrontendConfigStyleEntry(discoveredEntries, frontendStyles);
    logger.info("build", `entries :: count=${resolvedDiscovery.entries.length}`);
    const result = await runEsbuild(createEsbuildOptions({
      ...normalized,
      entryRecords: resolvedDiscovery.entries,
      frontendConfigScssPath: frontendStyles?.generatedScssPath,
    }, logger));
    const postProcessed = await postProcessBuildOutput({ normalized, result });
    logWarnings(logger, result.warnings);
    const summary = await toBuildResult({
      manifest: normalized.manifest,
      outDir: normalized.outDir,
      outputLayout: postProcessed.outputLayout,
      precompressed: postProcessed.precompressed,
      resolvedDiscovery,
      result,
      rootDir: normalized.rootDir,
      startedAt,
    });
    logger.info("build", `complete :: outputs=${summary.outputs.length} warnings=${summary.warnings}`);
    return summary;
  } catch (error) {
    logger.fail("build", `failed :: ${formatFailure(error)}`);
    throw error;
  }
}

export { bundle };
