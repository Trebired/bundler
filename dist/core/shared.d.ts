import type { BuildResult, Message } from "esbuild";
import type { BundlerBuildResult, BundlerResolvedDiscovery, NormalizedBundlerLogger } from "../src/types.d.ts";
import type { NormalizedManifestOptions } from "./discovery.js";
export declare function formatEsbuildMessage(message: Partial<Message>): string;
declare function logWarnings(logger: NormalizedBundlerLogger, warnings: Message[]): void;
declare function toBuildResult(args: {
    manifest: NormalizedManifestOptions;
    outDir: string;
    resolvedDiscovery: BundlerResolvedDiscovery;
    result: BuildResult<any>;
    rootDir: string;
    startedAt: number;
}): Promise<BundlerBuildResult>;
export declare function cleanOutDir(outDir: string): Promise<void>;
export declare function formatFailure(error: unknown): string;
export { logWarnings, toBuildResult };
//# sourceMappingURL=shared.d.ts.map