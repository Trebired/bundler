import type { BundlerEntryRecord, BundlerManifestOptions, BundlerOptions } from "../types.js";
declare const VIRTUAL_ENTRY_PREFIX = "trebired-virtual:";
type NormalizedDiscoverOptions = {
    dir: string;
    dirAbs: string;
    exclude: string[];
    extensions: string[];
    ignoreDirs: Set<string>;
    include: string[];
    maxBundleSize: number;
    namePrefix: string;
};
type ResolvedEntries = {
    duplicates: DuplicateBundlerEntryRecord[];
    records: BundlerEntryRecord[];
    signature: string;
};
type DuplicateBundlerEntryRecord = {
    dropped: BundlerEntryRecord;
    kept: BundlerEntryRecord;
};
type NormalizedManifestOptions = {
    enabled: boolean;
    file?: string;
};
declare function toPosixPath(value: string): string;
declare function resolveBundlerEntries(options: BundlerOptions, rootDir: string, settings?: {
    allowEmpty?: boolean;
}): Promise<ResolvedEntries>;
declare function toEntryPointMap(records: BundlerEntryRecord[], rootDir: string): Record<string, string>;
declare function toPublicEntryMap(records: BundlerEntryRecord[], rootDir: string): Record<string, string>;
declare function normalizeManifestOptions(manifest: BundlerManifestOptions | undefined): NormalizedManifestOptions;
declare function normalizeDiscoverRoots(rootDir: string, discover: BundlerOptions["discover"]): string[];
export { normalizeDiscoverRoots, normalizeManifestOptions, resolveBundlerEntries, toPublicEntryMap, toEntryPointMap, toPosixPath, VIRTUAL_ENTRY_PREFIX, };
export type { DuplicateBundlerEntryRecord, NormalizedDiscoverOptions, NormalizedManifestOptions, ResolvedEntries, };
//# sourceMappingURL=discovery.d.ts.map