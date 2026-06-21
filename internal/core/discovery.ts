export {
  normalizeDiscoverRoots,
  toEntryPointMap,
} from "./discovery/public.js";
export {
  normalizeManifestOptions,
  resolveBundlerEntries,
} from "./discovery/resolve.js";
export {
  toPosixPath,
  VIRTUAL_ENTRY_PREFIX,
} from "./discovery/shared.js";
export type {
  NormalizedAggregateModuleMap,
  NormalizedDiscoverOptions,
  NormalizedDiscoverRule,
  NormalizedManifestOptions,
  ResolvedDiscovery,
} from "./discovery/shared.js";
