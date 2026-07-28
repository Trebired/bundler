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

function createI18nPlugin(options: I18nPluginOptions): Plugin {
  return {
    name: "package-i18n",
    setup(build) {
      build.onLoad({ filter: /\.(?:[cm]?[jt]sx?)$/, namespace: "file" }, async (args) => {
        if (!isCodeFile(args.path) || !isInsideDirectory(options.rootDir, args.path)) return undefined;

        const source = await fs.readFile(args.path, "utf8");
        const transformed = await transformLocalTranslators({
          callerPath: args.path,
          i18n: options.i18n,
          rootDir: options.rootDir,
          source,
        });
        if (!transformed) return undefined;

        options.logger.info("i18n", `local-translator :: ${args.path}`);
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
