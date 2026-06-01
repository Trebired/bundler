import type { BuildOptions } from "esbuild";
import type { BundlerOptions, BundlerEntryRecord, NormalizedBundlerLogger } from "../types.js";
import { normalizeManifestOptions } from "./discovery.js";
type NormalizedBundlerOptions = {
    annotateSources: boolean;
    clean: boolean;
    define?: Record<string, string>;
    entries?: string[] | Record<string, string>;
    entryRecords?: BundlerEntryRecord[];
    external?: string[];
    format?: BundlerOptions["format"];
    logger?: BundlerOptions["logger"];
    loggerAdapter?: BundlerOptions["loggerAdapter"];
    manifest: ReturnType<typeof normalizeManifestOptions>;
    minify: boolean;
    outDir: string;
    platform?: BundlerOptions["platform"];
    publicPath?: string;
    rootDir: string;
    sourcemap?: BundlerOptions["sourcemap"];
    splitting: boolean;
    target?: string | string[];
};
declare function normalizeBundlerOptions(options: BundlerOptions): NormalizedBundlerOptions;
declare function createEsbuildOptions(options: NormalizedBundlerOptions, logger: NormalizedBundlerLogger): BuildOptions;
export { createEsbuildOptions, normalizeBundlerOptions };
export type { NormalizedBundlerOptions };
//# sourceMappingURL=esbuild-options.d.ts.map