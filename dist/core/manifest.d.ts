import type { Metafile } from "esbuild";
import type { BundlerEntryRecord } from "../types.js";
import type { NormalizedManifestOptions } from "./discovery.js";
type ManifestWriteResult = {
    manifestPath?: string;
};
declare function writeBundlerManifest(args: {
    entries: BundlerEntryRecord[];
    metafile?: Metafile;
    manifest: NormalizedManifestOptions;
    outDir: string;
    rootDir: string;
}): Promise<ManifestWriteResult>;
export { writeBundlerManifest };
//# sourceMappingURL=manifest.d.ts.map