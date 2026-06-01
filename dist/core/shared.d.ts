import type { BuildResult, Message } from "esbuild";
import type { BundlerBuildResult, NormalizedBundlerLogger } from "../types.js";
declare function logWarnings(logger: NormalizedBundlerLogger, warnings: Message[]): void;
declare function toBuildResult(args: {
    result: BuildResult<any>;
    rootDir: string;
    startedAt: number;
}): BundlerBuildResult;
declare function cleanOutDir(outDir: string): Promise<void>;
declare function formatFailure(error: unknown): string;
export { cleanOutDir, formatFailure, logWarnings, toBuildResult };
//# sourceMappingURL=shared.d.ts.map