import { context as createContext } from "esbuild";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { BUNDLER_LOG_GROUP, BUNDLER_PACKAGE_NAME } from "../constants.js";
import { resolveLogger } from "../logging.js";
import type { BundlerBuildResult, BundlerOptions, BundlerWatchSession } from "../types.js";
import { createEsbuildOptions, normalizeBundlerOptions } from "./esbuild-options.js";
import { cleanOutDir, formatFailure, logWarnings, toBuildResult } from "./shared.js";

async function watch(options: BundlerOptions): Promise<BundlerWatchSession> {
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
    logger.info("watch", `clean :: ${normalized.outDir}`);
    await cleanOutDir(normalized.outDir);
  }

  const context = await createContext(createEsbuildOptions(normalized, logger));

  const executeRebuild = async (): Promise<BundlerBuildResult> => {
    const startedAt = Date.now();
    const result = await context.rebuild();
    logWarnings(logger, result.warnings);
    const summary = toBuildResult({
      result,
      rootDir: normalized.rootDir,
      startedAt,
    });
    logger.info("watch", `rebuilt :: outputs=${summary.outputs.length} warnings=${summary.warnings}`);
    return summary;
  };

  try {
    logger.info("watch", "start");
    await executeRebuild();
    await context.watch();

    return {
      async rebuild() {
        try {
          return await executeRebuild();
        } catch (error) {
          logger.fail("watch", `rebuild-failed :: ${formatFailure(error)}`);
          throw error;
        }
      },
      async dispose() {
        logger.info("watch", "dispose");
        await context.dispose();
      },
    };
  } catch (error) {
    logger.fail("watch", `failed :: ${formatFailure(error)}`);
    await context.dispose();
    throw error;
  }
}

export { watch };
