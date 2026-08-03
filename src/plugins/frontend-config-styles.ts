import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileStringAsync } from "sass-embedded";
import type { Plugin } from "esbuild";

import { FRONTEND_CONFIG_PATH, FRONTEND_CONFIG_VIRTUAL_ENTRY_NAME, FRONTEND_CONFIG_VIRTUAL_ENTRY_PATH, loadFrontendConfigApi } from "../core/frontend-config.js";
import { injectSourceAnnotation } from "./source-annotations.js";
import { createScssAliasImporter, rewriteScssAliasDirectives } from "./scss/imports.js";
import type { NormalizedBundlerLogger } from "#3c8d8166992a";

const FRONTEND_CONFIG_STYLES_NAMESPACE = "package-frontend-config-styles";

type FrontendConfigStylesPluginOptions = {
  annotateSources: boolean;
  logger: NormalizedBundlerLogger;
  rootDir: string;
  sourcemapEnabled: boolean;
};

function createFrontendConfigStylesPlugin(options: FrontendConfigStylesPluginOptions): Plugin {
  return {
    name: "package-frontend-config-styles",
    setup(build) {
      build.onResolve({ filter: /^package-virtual:trebired-frontend-config-styles$/ }, (args) => {
        if (args.path !== FRONTEND_CONFIG_VIRTUAL_ENTRY_PATH) return null;
        return {
          namespace: FRONTEND_CONFIG_STYLES_NAMESPACE,
          path: FRONTEND_CONFIG_VIRTUAL_ENTRY_NAME,
        };
      });

      build.onLoad({ filter: /.*/, namespace: FRONTEND_CONFIG_STYLES_NAMESPACE }, async () => {
        try {
          const loaded = await loadFrontendConfigStyles(options.rootDir);
          const importer = createScssAliasImporter(options.rootDir);
          const virtualScssPath = path.join(options.rootDir, ".trebired", "frontend", "config.virtual.scss");
          const result = await compileStringAsync(
            rewriteScssAliasDirectives(loaded.scss),
            {
              importer,
              importers: [importer],
              loadPaths: [options.rootDir],
              sourceMap: options.sourcemapEnabled,
              sourceMapIncludeSources: options.sourcemapEnabled,
              style: "expanded",
              url: pathToFileURL(virtualScssPath),
            },
          );

          const contents = options.annotateSources
            ? injectSourceAnnotation({
              contents: result.css,
              filePath: virtualScssPath,
              kind: "css",
              rootDir: options.rootDir,
            })
            : result.css;

          return {
            contents,
            loader: "css",
            resolveDir: options.rootDir,
            watchDirs: await existingWatchDirs(options.rootDir),
            watchFiles: [
              ...(loaded.configPath ? [loaded.configPath] : []),
              ...result.loadedUrls
                .filter((url) => url.protocol === "file:")
                .map((url) => url.pathname),
            ],
          };
        } catch (error) {
          options.logger.error("frontend", "config-styles-failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      });
    },
  };
}

async function loadFrontendConfigStyles(rootDir: string): Promise<{ configPath: string | null; scss: string }> {
  const api = await loadFrontendConfigApi(rootDir);
  if (!api?.loadTrebiredFrontendConfig) {
    throw new Error("bundler-frontend-config-api-missing");
  }
  const loaded = await api.loadTrebiredFrontendConfig(rootDir, {
    defaultIfMissing: true,
    searchFrom: rootDir,
  });
  const scss = typeof loaded.generatedScss === "string"
    ? loaded.generatedScss
    : typeof api.generateTrebiredFrontendScss === "function"
      ? api.generateTrebiredFrontendScss(loaded.config)
      : "";

  if (!scss) throw new Error("bundler-frontend-config-scss-missing");
  return {
    configPath: loaded.configPath,
    scss,
  };
}

async function existingWatchDirs(rootDir: string): Promise<string[] | undefined> {
  const frontendDir = path.dirname(path.resolve(rootDir, FRONTEND_CONFIG_PATH));
  try {
    const stats = await fs.stat(frontendDir);
    return stats.isDirectory() ? [frontendDir] : undefined;
  } catch {
    return undefined;
  }
}

export { createFrontendConfigStylesPlugin };
