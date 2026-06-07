import type { BundlerDiscoverRuleStrategy, BundlerEntryRecord, BundlerManifestOptions, BundlerOptions, BundlerResolvedDiscovery } from "../types.js";
declare const VIRTUAL_ENTRY_PREFIX = "trebired-virtual:";
type NormalizedDiscoverRule = {
    exclude: string[];
    include: string[];
    key: string;
    maxBundleSize?: number;
    strategy: BundlerDiscoverRuleStrategy;
};
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
export type { NormalizedDiscoverOptions, NormalizedDiscoverRule, NormalizedManifestOptions, ResolvedDiscovery, };
//# sourceMappingURL=discovery.d.ts.map