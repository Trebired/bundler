import type { BuildResult, Message } from "esbuild";
import type { BundlerBuildResult, BundlerResolvedDiscovery, NormalizedBundlerLogger } from "../types.js";
import type { NormalizedManifestOptions } from "./discovery.js";
declare function logWarnings(logger: NormalizedBundlerLogger, warnings: Message[]): void;
declare function toBuildResult(args: {
    manifest: NormalizedManifestOptions;
    outDir: string;
    resolvedDiscovery: BundlerResolvedDiscovery;
    result: BuildResult<any>;
    rootDir: string;
    startedAt: number;
}): Promise<BundlerBuildResult>;
declare function cleanOutDir(outDir: string): Promise<void>;
declare function formatFailure(error: unknown): string;
export { cleanOutDir, formatFailure, logWarnings, toBuildResult };
//# sourceMappingURL=shared.d.ts.map