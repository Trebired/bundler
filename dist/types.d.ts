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
type BundlerVirtualEntries = Record<string, string>;
type BundlerEntrySource = "manual" | "discover" | "virtual";
type BundlerEntryRecord = {
    contents?: string;
    name: string;
    path: string;
    source: BundlerEntrySource;
};
type BundlerDerivedManifestEntry = {
    entryOutput: string;
    entryName?: string;
    inputs: string[];
    js: string[];
    css: string[];
    imports: string[];
};
type BundlerDerivedManifestChunk = {
    output: string;
    inputs: string[];
    css: string[];
    imports: string[];
};
type BundlerDerivedManifestOutputKind = "asset" | "chunk" | "entry";
type BundlerDerivedManifestOutput = {
    output: string;
    kind: BundlerDerivedManifestOutputKind;
    entryPoint?: string;
    entryName?: string;
    inputs: string[];
    css: string[];
    imports: string[];
    bytes: number;
};
type BundlerDerivedManifest = {
    entries: Record<string, BundlerDerivedManifestEntry>;
    chunks: Record<string, BundlerDerivedManifestChunk>;
    allOutputs: Record<string, BundlerDerivedManifestOutput>;
};
type BundlerOptions = {
    entries?: string[] | Record<string, string>;
    discover?: BundlerDiscoverOptions | BundlerDiscoverOptions[];
    virtualEntries?: BundlerVirtualEntries;
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
    onRebuilt?: (result: BundlerBuildResult) => void | Promise<void>;
    onEntrySetChanged?: (entries: Record<string, string>) => void | Promise<void>;
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
export type { BundlerBuildResult, BundlerDiscoverOptions, BundlerDerivedManifest, BundlerDerivedManifestChunk, BundlerDerivedManifestEntry, BundlerDerivedManifestOutput, BundlerDerivedManifestOutputKind, BundlerEntryRecord, BundlerEntrySource, BundlerGenericLogMethod, BundlerLogEvent, BundlerLogger, BundlerLoggerAdapter, BundlerLogMethod, BundlerManifestOptions, BundlerOptions, BundlerVirtualEntries, BundlerWatchSession, LoadedBundlerConfig, NormalizedBundlerLogger, };
//# sourceMappingURL=types.d.ts.map