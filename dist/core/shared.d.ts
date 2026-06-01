import type { BuildResult, Message } from "esbuild";
import type { BundlerBuildResult, BundlerEntryRecord, NormalizedBundlerLogger } from "../types.js";
import type { DuplicateBundlerEntryRecord } from "./discovery.js";
import type { NormalizedManifestOptions } from "./discovery.js";
declare function logWarnings(logger: NormalizedBundlerLogger, warnings: Message[]): void;
declare function logDuplicateEntries(args: {
    duplicates: DuplicateBundlerEntryRecord[];
    logger: NormalizedBundlerLogger;
    rootDir: string;
}): void;
declare function toBuildResult(args: {
    entries: BundlerEntryRecord[];
    manifest: NormalizedManifestOptions;
    outDir: string;
    result: BuildResult<any>;
    rootDir: string;
    startedAt: number;
}): Promise<BundlerBuildResult>;
declare function cleanOutDir(outDir: string): Promise<void>;
declare function formatFailure(error: unknown): string;
export { cleanOutDir, formatFailure, logDuplicateEntries, logWarnings, toBuildResult };
//# sourceMappingURL=shared.d.ts.map