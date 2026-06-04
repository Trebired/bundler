import type { Plugin } from "esbuild";
import type { NormalizedBundlerLogger } from "../types.js";
type SourceAnnotationsPluginOptions = {
    logger: NormalizedBundlerLogger;
    rootDir: string;
};
declare function resolveSourceLabel(filePath: string, rootDir: string): string;
declare function buildSourceAnnotation(filePath: string, rootDir: string): string;
declare function injectSourceAnnotation(args: {
    contents: string;
    filePath: string;
    kind: "code" | "css";
    rootDir: string;
}): string;
declare function createSourceAnnotationsPlugin(options: SourceAnnotationsPluginOptions): Plugin;
export { buildSourceAnnotation, createSourceAnnotationsPlugin, injectSourceAnnotation, resolveSourceLabel };
//# sourceMappingURL=source-annotations.d.ts.map