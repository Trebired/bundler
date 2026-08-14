import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "esbuild";

import type { BundlerOptions, NormalizedBundlerI18nOptions, NormalizedBundlerLogger } from "#3c8d8166992a";
import { injectSourceAnnotation } from "#ulrbecj1la7z";
import { transformLocalTranslators } from "./transform.js";
import { resolveI18nFolder } from "./validate.js";
import type { ResolvedI18nFolder } from "./validate.js";
import {
  isCodeFile,
  isInsideDirectory,
  resolveCodeLoader,
} from "./shared.js";

type I18nPluginOptions = {
  annotateSources: boolean;
  environment: BundlerOptions["environment"];
  i18n: NormalizedBundlerI18nOptions;
  logger: NormalizedBundlerLogger;
  rootDir: string;
};

type I18nPluginBuildState = {
  folderCache: Map<string, Promise<ResolvedI18nFolder>>;
  languageFiles: Set<string>;
  languages: Set<string>;
  startedAt: number;
  transformedFiles: number;
  transformedFolders: Set<string>;
};

const sharedFolderCache = new Map<string, Promise<ResolvedI18nFolder>>();

function createI18nPluginBuildState(options: I18nPluginOptions) {
  const state = createEmptyI18nPluginBuildState();
  return {
    flush() {
      flushI18nPluginBuildState(options, state);
    },
    register(folder: ResolvedI18nFolder) {
      registerI18nFolder(state, folder);
    },
    resolveFolder(args: {
        callerPath: string;
        i18n: NormalizedBundlerI18nOptions;
        rootDir: string;
    }) {
      return resolveCachedI18nFolder(state, args);
    },
  };
}

function createEmptyI18nPluginBuildState(): I18nPluginBuildState {
  return {
    folderCache: new Map<string, Promise<ResolvedI18nFolder>>(),
    languageFiles: new Set<string>(),
    languages: new Set<string>(),
    startedAt: 0,
    transformedFiles: 0,
    transformedFolders: new Set<string>(),
  };
}

function flushI18nPluginBuildState(options: I18nPluginOptions, state: I18nPluginBuildState): void {
  if (state.transformedFiles > 0) {
    options.logger.info("i18n", "local translators summary", createSummaryMetadata({
          environment: options.environment,
          languageFiles: state.languageFiles,
          languages: state.languages,
          startedAt: state.startedAt,
          target: options.i18n.logLabel,
          transformedFiles: state.transformedFiles,
          transformedFolders: state.transformedFolders,
    }));
  }

  resetI18nPluginBuildState(state);
}

function resetI18nPluginBuildState(state: I18nPluginBuildState): void {
  state.folderCache.clear();
  state.transformedFiles = 0;
  state.startedAt = 0;
  state.transformedFolders.clear();
  state.languageFiles.clear();
  state.languages.clear();
}

function registerI18nFolder(state: I18nPluginBuildState, folder: ResolvedI18nFolder): void {
  if (state.transformedFiles === 0) state.startedAt = performance.now();
  state.transformedFiles += 1;
  state.transformedFolders.add(folder.folderPath);
  for (const item of folder.modules) {
    state.languageFiles.add(item.filePath);
    state.languages.add(item.language);
  }
}

function resolveCachedI18nFolder(
  state: I18nPluginBuildState,
  args: {
    callerPath: string;
    i18n: NormalizedBundlerI18nOptions;
    rootDir: string;
  },
) {
  const folderPath = path.join(path.dirname(args.callerPath), args.i18n.dirName);
  const key = createI18nFolderCacheKey(args.rootDir, folderPath, args.i18n);
  const cached = state.folderCache.get(key) || sharedFolderCache.get(key);
  if (cached) return cached;

  const next = resolveI18nFolder(args).catch ((error) => {
      state.folderCache.delete(key);
      sharedFolderCache.delete(key);
      throw error;
  }).finally(() => {
      sharedFolderCache.delete(key);
  });
  state.folderCache.set(key, next);
  sharedFolderCache.set(key, next);
  return next;
}

function createI18nFolderCacheKey(
  rootDir: string,
  folderPath: string,
  i18n: NormalizedBundlerI18nOptions,
): string {
  return JSON.stringify({
      defaultLanguage: i18n.defaultLanguage,
      dirName: i18n.dirName,
      extensions: i18n.extensions,
      folderPath,
      rootDir,
      supportedLanguages: i18n.supportedLanguages,
  });
}

function createSummaryMetadata(args: {
    environment: BundlerOptions["environment"];
    languageFiles: Set<string>;
    languages: Set<string>;
    startedAt: number;
    target: string;
    transformedFiles: number;
    transformedFolders: Set<string>;
}): Record<string, unknown> {
  return {
    ...(args.target ? { target: args.target } : {}),
    ...(args.environment ? { environment: args.environment } : {}),
    transformed_files: args.transformedFiles,
    transformed_folders: args.transformedFolders.size,
    language_files: args.languageFiles.size,
    languages: Array.from(args.languages).sort(),
    took_ms: Math.round(performance.now() - args.startedAt),
  };
}

function createI18nPlugin(options: I18nPluginOptions): Plugin {
  const buildState = createI18nPluginBuildState(options);

  return {
    name: "package-i18n",
    setup(build) {
      build.onEnd(() => buildState.flush());

      build.onLoad({ filter: /\.(?:[cm]?[jt]sx?)$/, namespace: "file" }, async(args) => {
          if (!isCodeFile(args.path) || !isInsideDirectory(options.rootDir, args.path)) return undefined;

          const source = await fs.readFile(args.path, "utf8");
          const transformed = await transformLocalTranslators({
              callerPath: args.path,
              i18n: options.i18n,
              resolveFolder: buildState.resolveFolder,
              rootDir: options.rootDir,
              source,
          });
          if (!transformed) return undefined;

          buildState.register(transformed.folder);

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
