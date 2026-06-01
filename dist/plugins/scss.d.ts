import type { Plugin } from "esbuild";
import type { ClassNameMap } from "./obfuscation.js";
import type { NormalizedBundlerLogger } from "../types.js";
type ScssPluginOptions = {
    annotateSources: boolean;
    classNameMap?: ClassNameMap;
    logger: NormalizedBundlerLogger;
    rootDir: string;
    sourcemapEnabled: boolean;
};
declare function createScssPlugin(options: ScssPluginOptions): Plugin;
export { createScssPlugin };
//# sourceMappingURL=scss.d.ts.map