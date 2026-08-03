import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileStringAsync } from "sass-embedded";
import type { Plugin } from "esbuild";

import { injectSourceAnnotation } from "./source-annotations.js";
import { createScssAliasImporter, rewriteScssAliasDirectives } from "./scss/imports.js";
import type { NormalizedBundlerLogger } from "#3c8d8166992a";
import { FRONTEND_CONFIG_PATH, refreshFrontendConfigScss } from "#d0ppiu0440kk";

type ScssPluginOptions = {
  annotateSources: boolean;
  frontendConfigScssPath?: string;
  logger: NormalizedBundlerLogger;
  rootDir: string;
  sourcemapEnabled: boolean;
};

function createScssPlugin(options: ScssPluginOptions): Plugin {
  return {
    name: "package-scss",
    setup(build) {
      build.onLoad({ filter: /\.scss$/ }, async (args) => {
        try {
          const refreshed = await refreshManagedFrontendScss(args.path, options);
          const importer = createScssAliasImporter(options.rootDir);
          const result = await compileStringAsync(
            rewriteScssAliasDirectives(await fs.readFile(args.path, "utf8")),
            {
              importer,
              importers: [importer],
              loadPaths: [options.rootDir],
              sourceMap: options.sourcemapEnabled,
              sourceMapIncludeSources: options.sourcemapEnabled,
              style: "expanded",
              url: pathToFileURL(args.path),
            },
          );

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
            watchDirs: refreshed ? [path.dirname(path.resolve(options.rootDir, FRONTEND_CONFIG_PATH))] : undefined,
            watchFiles: [
              pathToFileURL(args.path),
              ...result.loadedUrls,
              ...(refreshed?.configPath ? [pathToFileURL(refreshed.configPath)] : []),
            ]
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

async function refreshManagedFrontendScss(filePath: string, options: ScssPluginOptions) {
  if (!options.frontendConfigScssPath) return null;
  if (path.resolve(filePath) !== path.resolve(options.frontendConfigScssPath)) return null;
  return await refreshFrontendConfigScss(options.rootDir);
}

export { createScssPlugin };
