import path from "node:path";
import { compileAsync } from "sass-embedded";
import { injectSourceAnnotation } from "./source-annotations.js";
function createScssPlugin(options) {
    return {
        name: "trebired-scss",
        setup(build) {
            build.onLoad({ filter: /\.scss$/ }, async (args) => {
                try {
                    const result = await compileAsync(args.path, {
                        loadPaths: [options.rootDir],
                        sourceMap: options.sourcemapEnabled,
                        sourceMapIncludeSources: options.sourcemapEnabled,
                        style: "expanded",
                    });
                    const contents = options.annotateSources
                        ? injectSourceAnnotation({
                            contents: result.css,
                            filePath: args.path,
                            kind: "css",
                            rootDir: options.rootDir,
                        })
                        : result.css;
                    return {
                        contents,
                        loader: "css",
                        resolveDir: path.dirname(args.path),
                        watchFiles: result.loadedUrls
                            .filter((url) => url.protocol === "file:")
                            .map((url) => url.pathname),
                    };
                }
                catch (error) {
                    options.logger.error("scss", `compile-failed :: ${args.path}`, {
                        error: error instanceof Error ? error.message : String(error),
                    });
                    throw error;
                }
            });
        },
    };
}
export { createScssPlugin };
//# sourceMappingURL=scss.js.map