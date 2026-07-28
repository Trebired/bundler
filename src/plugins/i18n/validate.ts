import fs from "node:fs/promises";
import path from "node:path";

import type { NormalizedBundlerI18nOptions } from "#3c8d8166992a";
import { flattenMessageKeys, parseMessagesSource } from "./parse.js";
import { normalizeLanguage, toRootRelative } from "./shared.js";

type ResolvedI18nLanguageModule = {
  filePath: string;
  keys: string[];
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
  const violations: string[] = [];
  const entries = await readFolderEntries(folderPath, args.rootDir, violations);
  if (!entries) throwI18nFolderError(folderPath, args.rootDir, violations);

  const files = collectLanguageFiles(folderPath, entries || [], args.i18n, args.rootDir, violations);
  const languages = expectedLanguages(files, args.i18n);
  validateExpectedFiles(folderPath, files, languages, args.i18n, args.rootDir, violations);
  const modules = await loadLanguageModules(folderPath, files, languages, args.rootDir, violations);
  validateLanguageKeys(folderPath, modules, args.i18n, args.rootDir, violations);
  if (violations.length > 0) throwI18nFolderError(folderPath, args.rootDir, violations);
  return { folderPath, modules };
}

async function readFolderEntries(
  folderPath: string,
  rootDir: string,
  violations: string[],
): Promise<import("node:fs").Dirent[] | null> {
  try {
    return await fs.readdir(folderPath, { withFileTypes: true });
  } catch {
    violations.push(`missing-folder :: ${toRootRelative(rootDir, folderPath)}`);
    return null;
  }
}

function collectLanguageFiles(
  folderPath: string,
  entries: import("node:fs").Dirent[],
  i18n: NormalizedBundlerI18nOptions,
  rootDir: string,
  violations: string[],
): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of entries) {
    const filePath = path.join(folderPath, entry.name);
    const language = entry.isFile() ? languageFromFileName(entry.name, i18n) : "";
    if (!language || i18n.supportedLanguages && !i18n.supportedLanguages.includes(language)) {
      violations.push(`unsupported-language-file :: ${toRootRelative(rootDir, filePath)}`);
      continue;
    }
    files.set(language, filePath);
  }
  return files;
}

function expectedLanguages(files: Map<string, string>, i18n: NormalizedBundlerI18nOptions): string[] {
  if (i18n.supportedLanguages) return i18n.supportedLanguages;
  const inferred = Array.from(files.keys()).sort();
  return inferred.includes(i18n.defaultLanguage) ? inferred : [i18n.defaultLanguage, ...inferred];
}

function validateExpectedFiles(
  folderPath: string,
  files: Map<string, string>,
  languages: string[],
  i18n: NormalizedBundlerI18nOptions,
  rootDir: string,
  violations: string[],
): void {
  for (const language of languages) {
    if (files.has(language)) continue;
    const filePath = path.join(folderPath, `${language}${i18n.extensions[0]}`);
    violations.push(`missing-language-file :: ${language} :: ${toRootRelative(rootDir, filePath)}`);
  }
}

async function loadLanguageModules(
  folderPath: string,
  files: Map<string, string>,
  languages: string[],
  rootDir: string,
  violations: string[],
): Promise<ResolvedI18nLanguageModule[]> {
  const modules: ResolvedI18nLanguageModule[] = [];
  for (const language of languages) {
    const filePath = files.get(language);
    if (!filePath) continue;
    try {
      const source = await fs.readFile(filePath, "utf8");
      modules.push({
        filePath,
        keys: flattenMessageKeys(parseMessagesSource(source, filePath)),
        language,
        rootRel: toRootRelative(rootDir, filePath),
      });
    } catch (error) {
      violations.push(`invalid-default-export :: ${toRootRelative(rootDir, filePath)} :: ${formatError(error)}`);
    }
  }
  return modules;
}

function validateLanguageKeys(
  folderPath: string,
  modules: ResolvedI18nLanguageModule[],
  i18n: NormalizedBundlerI18nOptions,
  rootDir: string,
  violations: string[],
): void {
  const fallback = modules.find((item) => item.language === i18n.defaultLanguage);
  if (!fallback) return;
  for (const item of modules) {
    if (item.language === i18n.defaultLanguage) continue;
    const missing = fallback.keys.filter((key) => !item.keys.includes(key));
    const extra = item.keys.filter((key) => !fallback.keys.includes(key));
    if (missing.length === 0 && extra.length === 0) continue;
    violations.push(`key-mismatch :: ${toRootRelative(rootDir, folderPath)} :: ${item.language} :: ${formatKeyDiff(missing, extra)}`);
  }
}

function languageFromFileName(fileName: string, i18n: NormalizedBundlerI18nOptions): string {
  const extension = i18n.extensions.find((item) => fileName.endsWith(item));
  if (!extension) return "";
  const language = normalizeLanguage(fileName.slice(0, -extension.length));
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(language) ? language : "";
}

function formatKeyDiff(missing: string[], extra: string[]): string {
  return [
    missing.length ? `missing=${missing.join(",")}` : "",
    extra.length ? `extra=${extra.join(",")}` : "",
  ].filter(Boolean).join(" :: ");
}

function throwI18nFolderError(folderPath: string, rootDir: string, violations: string[]): never {
  throw new Error([
    `bundler-i18n-invalid-folder :: ${toRootRelative(rootDir, folderPath)}`,
    ...violations.map((violation) => `  - ${violation}`),
  ].join("\n"));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export {
  resolveI18nFolder,
};
export type {
  ResolvedI18nFolder,
  ResolvedI18nLanguageModule,
};
