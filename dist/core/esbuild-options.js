import path from "node:path";
import { createScssPlugin } from "../plugins/scss.js";
import { createSourceAnnotationsPlugin } from "../plugins/source-annotations.js";
import { createVirtualEntriesPlugin } from "../plugins/virtual-entries.js";
import { normalizeManifestOptions, toEntryPointMap } from "./discovery.js";
function resolveModeDefaults(mode) {
    if (mode === "debug") {
        return {
            minify: false,
            stripComments: false,
        };
    }
    return {
        minify: true,
        stripComments: true,
    };
}
function normalizeBundlerOptions(options) {
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
        environment: options.environment,
        entries: options.entries,
        external: options.external,
        format: options.format,
        logger: options.logger,
        loggerAdapter: options.loggerAdapter,
        manifest: normalizeManifestOptions(options.manifest),
        minify: options.minify ?? defaults.minify,
        mode,
        onEntrySetChanged: options.onEntrySetChanged,
        onRebuilt: options.onRebuilt,
        outDir: resolvedOutDir,
        publicPath: options.publicPath,
        rootDir,
        sourcemap: options.sourcemap,
        splitting: Boolean(options.splitting),
        stripComments: options.stripComments ?? defaults.stripComments,
        target: options.target,
    };
}
function createEsbuildOptions(options, logger) {
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
    logger.info("scss", "scss compiler enabled");
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
        platform: options.environment,
    };
}
export { createEsbuildOptions, normalizeBundlerOptions };
//# sourceMappingURL=esbuild-options.js.map