import fs from "node:fs/promises";
import type { Plugin } from "esbuild";

import type { NormalizedBundlerI18nOptions, NormalizedBundlerLogger } from "#3c8d8166992a";
import { injectSourceAnnotation } from "#ulrbecj1la7z";
import { transformLocalTranslators } from "./transform.js";
import {
  isCodeFile,
  isInsideDirectory,
  resolveCodeLoader,
} from "./shared.js";

type I18nPluginOptions = {
  annotateSources: boolean;
  i18n: NormalizedBundlerI18nOptions;
  logger: NormalizedBundlerLogger;
  rootDir: string;
};

function createI18nPluginLogState(logger: NormalizedBundlerLogger) {
  let transformedFiles = 0;
  let loggedFiles = 0;
  const transformedFolders = new Set<string>();

  function logBatch(): void {
    if (transformedFiles - loggedFiles < 10) return;
    loggedFiles = transformedFiles;
    logger.info("i18n", "local translators transformed", {
        transformed_files: transformedFiles,
        transformed_folders: transformedFolders.size,
    });
  }

  return {
    flush() {
      if (transformedFiles > 0) {
        logger.info("i18n", "local translators complete", {
            transformed_files: transformedFiles,
            transformed_folders: transformedFolders.size,
        });
      }

      transformedFiles = 0;
      loggedFiles = 0;
      transformedFolders.clear();
    },
    register(folderPath: string) {
      transformedFiles += 1;
      transformedFolders.add(folderPath);
      logBatch();
    },
  };
}

function createI18nPlugin(options: I18nPluginOptions): Plugin {
  const logState = createI18nPluginLogState(options.logger);

  return {
    name: "package-i18n",
    setup(build) {
      build.onEnd(() => logState.flush());

      build.onLoad({ filter: /\.(?:[cm]?[jt]sx?)$/, namespace: "file" }, async(args) => {
          if (!isCodeFile(args.path) || !isInsideDirectory(options.rootDir, args.path)) return undefined;

          const source = await fs.readFile(args.path, "utf8");
          const transformed = await transformLocalTranslators({
              callerPath: args.path,
              i18n: options.i18n,
              rootDir: options.rootDir,
              source,
          });
          if (!transformed) return undefined;

          logState.register(transformed.folder.folderPath);

          const contents = options.annotateSources
          ? injectSourceAnnotation({
              contents: transformed.contents,
              filePath: args.path,
              kind: "code",
              rootDir: options.rootDir,
          })
          : transformed.contents;

          return {
            contents,
            loader: resolveCodeLoader(args.path),
            watchDirs: [transformed.folder.folderPath],
            watchFiles: [args.path, ...transformed.folder.modules.map((item) => item.filePath)],
          };
      });
    },
  };
}

export {
  createI18nPlugin,
};
