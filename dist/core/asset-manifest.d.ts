import type { BundlerAssetManifest, BundlerBuildAssetManifestOptions, BundlerCollectedAssetLinks, BundlerCollectAssetLinksOptions } from "../types.js";
declare function buildAssetManifest(options: BundlerBuildAssetManifestOptions): BundlerAssetManifest;
declare function collectAssetLinks(manifest: BundlerAssetManifest, entryIds: string[], options?: BundlerCollectAssetLinksOptions): BundlerCollectedAssetLinks;
export { buildAssetManifest, collectAssetLinks };
//# sourceMappingURL=asset-manifest.d.ts.map