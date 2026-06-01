import fs from "node:fs/promises";
import path from "node:path";
import { toPublicEntryMap } from "./discovery.js";
import { writeBundlerManifest } from "./manifest.js";
function formatEsbuildMessage(message) {
    const location = message.location
        ? `${message.location.file}:${message.location.line}:${message.location.column}`
        : "";
    const pieces = [location, message.text].filter(Boolean);
    return pieces.join(" :: ");
}
function logWarnings(logger, warnings) {
    for (const warning of warnings) {
        logger.warn("build", formatEsbuildMessage(warning));
    }
}
function resolveOutputs(result, rootDir) {
    if (!result.metafile)
        return [];
    return Object.keys(result.metafile.outputs)
        .map((value) => path.isAbsolute(value) ? value : path.resolve(rootDir, value))
        .sort();
}
async function toBuildResult(args) {
    const outputs = resolveOutputs(args.result, args.rootDir);
    const manifestWrite = await writeBundlerManifest({
        entries: args.entries,
        metafile: args.result.metafile,
        manifest: args.manifest,
        outDir: args.outDir,
        rootDir: args.rootDir,
    });
    return {
        entries: toPublicEntryMap(args.entries, args.rootDir),
        outputs,
        warnings: args.result.warnings.length,
        metafile: args.result.metafile,
        manifestPath: manifestWrite.manifestPath,
        durationMs: Date.now() - args.startedAt,
    };
}
async function cleanOutDir(outDir) {
    await fs.rm(outDir, { force: true, recursive: true });
}
function formatFailure(error) {
    if (error && typeof error === "object" && Array.isArray(error.errors)) {
        const errors = error.errors;
        return errors.map(formatEsbuildMessage).join(" | ");
    }
    return error instanceof Error ? error.message : String(error);
}
export { cleanOutDir, formatFailure, logWarnings, toBuildResult };
//# sourceMappingURL=shared.js.map