import type { Metafile } from "esbuild";
import type { BundlerDerivedManifest } from "../types.js";
type DeriveManifestOptions = {
    outDir: string;
    rootDir: string;
};
declare function deriveManifest(metafile: Metafile, options: DeriveManifestOptions): BundlerDerivedManifest;
export { deriveManifest };
export type { DeriveManifestOptions };
//# sourceMappingURL=derive-manifest.d.ts.map