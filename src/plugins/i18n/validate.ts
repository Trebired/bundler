import fs from "node:fs/promises";
import path from "node:path";

import {
  checkColocatedI18n,
  formatI18nCheckViolations,
} from "@package/i18n/checker";

import type { NormalizedBundlerI18nOptions } from "#3c8d8166992a";
import { normalizeLanguage, toRootRelative } from "./shared.js";

type ResolvedI18nLanguageModule = {
  filePath: string;
  language: string;
  rootRel: string;
};

type ResolvedI18nFolder = {
  folderPath: string;
  modules: ResolvedI18nLanguageModule[];
};

async function resolveI18nFolder(args: {
    callerPath: string;
    i18n: NormalizedBundlerI18nOptions;
    rootDir: string;
}): Promise<ResolvedI18nFolder> {
  const folderPath = path.join(path.dirname(args.callerPath), args.i18n.dirName);
  await assertValidI18nFolder(folderPath, args);
  return {
    folderPath,
    modules: await collectLanguageModules(folderPath, args.i18n, args.rootDir),
  };
}

async function assertValidI18nFolder(
  folderPath: string,
  args: {
    i18n: NormalizedBundlerI18nOptions;
    rootDir: string;
  },
): Promise<void> {
  const result = await checkColocatedI18n({
      defaultLanguage: args.i18n.defaultLanguage,
      dirName: args.i18n.dirName,
      dirs: [folderPath],
      extensions: args.i18n.extensions,
      rootDir: args.rootDir,
      supportedLanguages: args.i18n.supportedLanguages,
  });
  if (!result.ok) throwI18nFolderError(folderPath, args.rootDir, formatI18nCheckViolations(result.violations, result.rootDir));
}

async function collectLanguageModules(
  folderPath: string,
  i18n: NormalizedBundlerI18nOptions,
  rootDir: string,
): Promise<ResolvedI18nLanguageModule[]> {
  const files = await collectLanguageFiles(folderPath, i18n);
  return resolveLanguages(files, i18n).map((language) => {
      const filePath = files.get(language) || "";
      return {
        filePath,
        language,
        rootRel: toRootRelative(rootDir, filePath),
      };
  });
}

async function collectLanguageFiles(
  folderPath: string,
  i18n: NormalizedBundlerI18nOptions,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    const language = entry.isFile() ? languageFromFileName(entry.name, i18n) : "";
    if (language) files.set(language, path.join(folderPath, entry.name));
  }
  return files;
}

function resolveLanguages(files: Map<string, string>, i18n: NormalizedBundlerI18nOptions): string[] {
  if (i18n.supportedLanguages) return i18n.supportedLanguages;
  const inferred = Array.from(files.keys()).sort();
  return inferred.includes(i18n.defaultLanguage) ? inferred : [i18n.defaultLanguage, ...inferred];
}

function languageFromFileName(fileName: string, i18n: NormalizedBundlerI18nOptions): string {
  const extension = i18n.extensions.find((item) => fileName.endsWith(item));
  if (!extension) return "";
  const language = normalizeLanguage(fileName.slice(0, -extension.length));
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(language) ? language : "";
}

function throwI18nFolderError(folderPath: string, rootDir: string, formattedViolations: string): never {
  throw new Error([
      `bundler-i18n-invalid-folder :: ${toRootRelative(rootDir, folderPath)}`,
      formattedViolations,
    ].join("\n"));
}

export {
  resolveI18nFolder,
};
export type {
  ResolvedI18nFolder,
  ResolvedI18nLanguageModule,
};
