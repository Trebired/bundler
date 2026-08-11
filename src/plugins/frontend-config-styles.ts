import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileStringAsync } from "sass-embedded";
import type { OnLoadResult, Plugin } from "esbuild";

import {
  FRONTEND_CONFIG_PATH,
  FRONTEND_CONFIG_VIRTUAL_ENTRY_NAME,
  FRONTEND_CONFIG_VIRTUAL_ENTRY_PATH,
  resolveFrontendConfigStyles,
} from "#d0ppiu0440kk";
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
      build.onResolve({ filter: /^package-virtual:frontend-config-styles$/ }, (args) => {
          if (args.path !== FRONTEND_CONFIG_VIRTUAL_ENTRY_PATH) return null;
          return {
            namespace: FRONTEND_CONFIG_STYLES_NAMESPACE,
            path: FRONTEND_CONFIG_VIRTUAL_ENTRY_NAME,
          };
      });

      build.onLoad({ filter: /.*/, namespace: FRONTEND_CONFIG_STYLES_NAMESPACE }, async () => {
          return loadFrontendConfigStyle(options);
      });
    },
  };
}

async function loadFrontendConfigStyle(options: FrontendConfigStylesPluginOptions): Promise<OnLoadResult> {
  try {
    const loaded = await resolveFrontendConfigStyles(options.rootDir);
    const virtualScssPath = frontendVirtualScssPath(options.rootDir);
    const importer = createScssAliasImporter(options.rootDir);
    const result = await compileStringAsync(rewriteScssAliasDirectives(loaded.scss), {
        importer,
        importers: [importer],
        loadPaths: [options.rootDir],
        sourceMap: options.sourcemapEnabled,
        sourceMapIncludeSources: options.sourcemapEnabled,
        style: "expanded",
        url: pathToFileURL(virtualScssPath),
    });
    return {
      contents: annotateCss(options, virtualScssPath, result.css),
      loader: "css",
      resolveDir: options.rootDir,
      watchDirs: await existingWatchDirs(options.rootDir),
      watchFiles: frontendConfigWatchFiles(loaded.dependencies, result.loadedUrls),
    };
  } catch (error) {
    options.logger.error("frontend", "config-styles-failed", {
        error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function annotateCss(options: FrontendConfigStylesPluginOptions, filePath: string, contents: string): string {
  return options.annotateSources
  ? injectSourceAnnotation({ contents, filePath, kind: "css", rootDir: options.rootDir })
  : contents;
}

function frontendConfigWatchFiles(dependencies: string[], loadedUrls: URL[]): string[] {
  return [
    ...dependencies,
    ...loadedUrls
    .filter((url) => url.protocol === "file:")
    .map((url) => url.pathname),
  ];
}

function frontendVirtualScssPath(rootDir: string): string {
  return path.join(rootDir, path.dirname(FRONTEND_CONFIG_PATH), "config.virtual.scss");
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

export { FRONTEND_CONFIG_STYLES_NAMESPACE, createFrontendConfigStylesPlugin };
