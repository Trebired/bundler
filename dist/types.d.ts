import type { Metafile, Format, Platform } from "esbuild";
import type { LoggerAdapterEvent, LoggerAdapterGenericLogMethod, LoggerAdapterLogger, LoggerAdapterLogMethod, LoggerAdapterWriter, NormalizedLoggerAdapter } from "@trebired/logger-adapter";
type BundlerLogger = LoggerAdapterLogger;
type BundlerLoggerAdapter = LoggerAdapterWriter;
type BundlerLogMethod = LoggerAdapterLogMethod;
type BundlerGenericLogMethod = LoggerAdapterGenericLogMethod;
type BundlerLogEvent = LoggerAdapterEvent;
type NormalizedBundlerLogger = NormalizedLoggerAdapter;
type BundlerDiscoverOptions = {
    dir: string;
    include?: string[];
    exclude?: string[];
    extensions?: string[];
    ignoreDirs?: string[];
    namePrefix?: string;
};
type BundlerManifestOptions = boolean | {
    file?: string;
};
type BundlerEntrySource = "manual" | "discover";
type BundlerEntryRecord = {
    name: string;
    path: string;
    source: BundlerEntrySource;
};
type BundlerOptions = {
    entries?: string[] | Record<string, string>;
    discover?: BundlerDiscoverOptions | BundlerDiscoverOptions[];
    outDir: string;
    rootDir?: string;
    platform?: Platform;
    format?: Format;
    target?: string | string[];
    minify?: boolean;
    sourcemap?: boolean | "inline" | "external";
    splitting?: boolean;
    publicPath?: string;
    external?: string[];
    define?: Record<string, string>;
    clean?: boolean;
    annotateSources?: boolean;
    manifest?: BundlerManifestOptions;
    logger?: BundlerLogger;
    loggerAdapter?: BundlerLoggerAdapter;
};
type BundlerBuildResult = {
    entries: Record<string, string>;
    outputs: string[];
    warnings: number;
    metafile?: Metafile;
    manifestPath?: string;
    durationMs: number;
};
type BundlerWatchSession = {
    rebuild(): Promise<BundlerBuildResult>;
    dispose(): Promise<void>;
};
type LoadedBundlerConfig = {
    config: BundlerOptions;
    configPath: string;
};
export type { BundlerBuildResult, BundlerDiscoverOptions, BundlerEntryRecord, BundlerEntrySource, BundlerGenericLogMethod, BundlerLogEvent, BundlerLogger, BundlerLoggerAdapter, BundlerLogMethod, BundlerManifestOptions, BundlerOptions, BundlerWatchSession, LoadedBundlerConfig, NormalizedBundlerLogger, };
//# sourceMappingURL=types.d.ts.map