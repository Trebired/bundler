import type { BundlerEntryRecord, BundlerManifestOptions, BundlerOptions, BundlerResolvedDiscovery } from "../types.js";
declare const VIRTUAL_ENTRY_PREFIX = "trebired-virtual:";
type NormalizedAggregateModuleMap = {
    allowEmpty: boolean;
    collapseIndex: boolean;
    exports: {
        default: boolean;
        map: string;
        resolver: string;
        root?: string;
    };
    kind: "module-map";
    keyFromPath: "relative-path";
    matchedModuleExportName: string;
    rootModule?: string;
    rootModuleExportName: string;
};
type NormalizedEntryRule = {
    exclude: string[];
    include: string[];
    key: string;
    strategy: "entry";
};
type NormalizedBundleRule = {
    exclude: string[];
    include: string[];
    key: string;
    maxBundleSize: number;
    strategy: "bundle";
};
type NormalizedIgnoreRule = {
    exclude: string[];
    include: string[];
    key: string;
    strategy: "ignore";
};
type NormalizedAggregateRule = {
    aggregate: NormalizedAggregateModuleMap;
    exclude: string[];
    include: string[];
    key: string;
    strategy: "aggregate";
};
type NormalizedDiscoverRule = NormalizedEntryRule | NormalizedBundleRule | NormalizedIgnoreRule | NormalizedAggregateRule;
type NormalizedDiscoverOptions = {
    dir: string;
    dirAbs: string;
    ignoreDirs: Set<string>;
    rules: NormalizedDiscoverRule[];
};
type ResolvedDiscovery = BundlerResolvedDiscovery & {
    signature: string;
};
type NormalizedManifestOptions = {
    enabled: boolean;
    file?: string;
};
declare function toPosixPath(value: string): string;
declare function resolveBundlerEntries(options: BundlerOptions, rootDir: string, settings?: {
    allowEmpty?: boolean;
}): Promise<ResolvedDiscovery>;
declare function toEntryPointMap(records: BundlerEntryRecord[], rootDir: string): Record<string, string>;
declare function normalizeManifestOptions(manifest: BundlerManifestOptions | undefined): NormalizedManifestOptions;
declare function normalizeDiscoverRoots(rootDir: string, discover: BundlerOptions["discover"]): string[];
export { normalizeDiscoverRoots, normalizeManifestOptions, resolveBundlerEntries, toEntryPointMap, toPosixPath, VIRTUAL_ENTRY_PREFIX, };
export type { NormalizedAggregateModuleMap, NormalizedDiscoverOptions, NormalizedDiscoverRule, NormalizedManifestOptions, ResolvedDiscovery, };
//# sourceMappingURL=discovery.d.ts.map