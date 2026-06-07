import type { Metafile } from "esbuild";
import type { BundlerResolvedDiscovery } from "../types.js";
import type { NormalizedManifestOptions } from "./discovery.js";
type ManifestWriteResult = {
    manifestPath?: string;
};
declare function writeBundlerManifest(args: {
    metafile?: Metafile;
    manifest: NormalizedManifestOptions;
    outDir: string;
    resolvedDiscovery: BundlerResolvedDiscovery;
    rootDir: string;
}): Promise<ManifestWriteResult>;
export { writeBundlerManifest };
//# sourceMappingURL=manifest.d.ts.map