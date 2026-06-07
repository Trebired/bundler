import { build as runEsbuild } from "esbuild";
import { logPackageInitialized } from "@trebired/logger-adapter";
import { BUNDLER_LOG_GROUP, BUNDLER_PACKAGE_NAME } from "../constants.js";
import { resolveLogger } from "../logging.js";
import { createEsbuildOptions, normalizeBundlerOptions } from "./esbuild-options.js";
import { resolveBundlerEntries } from "./discovery.js";
import { cleanOutDir, formatFailure, logWarnings, toBuildResult } from "./shared.js";
async function bundle(options) {
    const normalized = normalizeBundlerOptions(options || {});
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
        const resolvedDiscovery = await resolveBundlerEntries(options || {}, normalized.rootDir);
        logger.info("build", `entries :: count=${resolvedDiscovery.entries.length}`);
        const result = await runEsbuild(createEsbuildOptions({
            ...normalized,
            entryRecords: resolvedDiscovery.entries,
        }, logger));
        logWarnings(logger, result.warnings);
        const summary = await toBuildResult({
            manifest: normalized.manifest,
            outDir: normalized.outDir,
            resolvedDiscovery,
            result,
            rootDir: normalized.rootDir,
            startedAt,
        });
        logger.info("build", `complete :: outputs=${summary.outputs.length} warnings=${summary.warnings}`);
        return summary;
    }
    catch (error) {
        logger.fail("build", `failed :: ${formatFailure(error)}`);
        throw error;
    }
}
export { bundle };
//# sourceMappingURL=build.js.map