import path from "node:path";
import { compileAsync } from "sass-embedded";
import type { Plugin } from "esbuild";

import { injectSourceAnnotation } from "./source-annotations.js";
import { rewriteCssClassTokens } from "./obfuscation.js";
import type { ClassNameMap } from "./obfuscation.js";
import type { NormalizedBundlerLogger } from "../types.js";

type ScssPluginOptions = {
  annotateSources: boolean;
  classNameMap?: ClassNameMap;
  logger: NormalizedBundlerLogger;
  rootDir: string;
  sourcemapEnabled: boolean;
};

function createScssPlugin(options: ScssPluginOptions): Plugin {
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

          const transformedCss = options.classNameMap && options.classNameMap.size > 0
            ? rewriteCssClassTokens(result.css, options.classNameMap)
            : result.css;

          const contents = options.annotateSources
            ? injectSourceAnnotation({
              contents: transformedCss,
              filePath: args.path,
              kind: "css",
              rootDir: options.rootDir,
            })
            : transformedCss;

          return {
            contents,
            loader: "css",
            resolveDir: path.dirname(args.path),
            watchFiles: result.loadedUrls
              .filter((url) => url.protocol === "file:")
              .map((url) => url.pathname),
          };
        } catch (error) {
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
