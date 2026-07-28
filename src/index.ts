export { BUNDLER_LOG_GROUP, BUNDLER_PACKAGE_NAME } from "./constants.js";
export { bundle } from "./core/build.js";
export { buildAssetManifest, collectAssetLinks } from "./core/asset-manifest.js";
export {
  collectRelatedFrontendEntries,
  createFrontendEntryRules,
  DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_RELATED_ENTRY_PATTERNS,
} from "./core/frontend.js";
export { precompressAssets } from "./core/precompression.js";
export { collectRelatedEntries } from "./core/related-entries.js";
export { deriveManifest } from "./core/derive-manifest.js";
export { walkImportGraph } from "./core/import-graph.js";
export { watch } from "./core/watch.js";
export { defineBundlerConfig } from "./config/index.js";
export { resolveLogger } from "./logging.js";
export { buildSourceAnnotation, injectSourceAnnotation, resolveSourceLabel } from "./plugins/source-annotations.js";
export { createScssPlugin } from "./plugins/scss.js";
export { createI18nPlugin } from "./plugins/i18n.js";
export { runCli } from "./cli/run-cli.js";

export type {
  BundlerAggregateEntryMetadata,
  BundlerAggregateKind,
  BundlerAggregateModuleMap,
  BundlerAggregateModuleMapExports,
  BundlerAggregateRuleMetadata,
  BundlerAssetManifest,
  BundlerAssetManifestEntry,
  BundlerAssetManifestOutput,
  BundlerAssetManifestRule,
  BundlerAssetManifestSource,
  BundlerBuildAssetManifestOptions,
  BundlerBuildResult,
  BundlerCollectedAssetLinks,
  BundlerCollectAssetLinksLookup,
  BundlerCollectAssetLinksOptions,
  BundlerDiscoverOptions,
  BundlerDiscoverRule,
  BundlerDiscoverRuleStrategy,
  BundlerDerivedManifest,
  BundlerDerivedManifestChunk,
  BundlerDerivedManifestEntry,
  BundlerDerivedManifestOutput,
  BundlerDerivedManifestOutputKind,
  BundlerDiscoverAggregateRule,
  BundlerDiscoverBundleRule,
  BundlerDiscoverEntryRule,
  BundlerDiscoverIgnoreRule,
  BundlerEntryKind,
  BundlerEntryRecord,
  BundlerEntrySource,
  BundlerEnvironment,
  BundlerGenericLogMethod,
  BundlerImportGraph,
  BundlerImportGraphFile,
  BundlerImportGraphImport,
  BundlerImportGraphImportKind,
  BundlerImportGraphOptions,
  BundlerImportGraphTsconfigOptions,
  BundlerI18nOptions,
  BundlerLogEvent,
  BundlerLogger,
  BundlerLoggerAdapter,
  BundlerLogMethod,
  BundlerManifestOptions,
  BundlerOptions,
  BundlerOutputLayoutKind,
  BundlerOutputLayoutMove,
  BundlerOutputLayoutOptions,
  BundlerOutputLayoutPatterns,
  BundlerOutputLayoutStats,
  BundlerPrecompressAssetsOptions,
  BundlerPrecompressFormat,
  BundlerPrecompressedAsset,
  BundlerPrecompressOptions,
  BundlerPrecompressStats,
  BundlerRelatedEntriesOptions,
  BundlerRelatedEntriesResult,
  BundlerRelatedEntryMatch,
  BundlerFrontendEntryRule,
  BundlerFrontendEntryRulesOptions,
  BundlerFrontendRelatedEntriesOptions,
  BundlerResolvedDiscovery,
  BundlerResolvedRule,
  BundlerTsconfigPaths,
  BundlerWatchSession,
  LoadedBundlerConfig,
  NormalizedBundlerLogger,
  NormalizedBundlerI18nOptions,
} from "./types.js";

export { bundle as default } from "./core/build.js";
