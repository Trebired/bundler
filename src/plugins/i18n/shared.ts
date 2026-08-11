import path from "node:path";
import type { Loader } from "esbuild";

import { escapeRegExp, toPosixPath } from "#5kd9snhn6zft";
import { normalizeI18nLanguage as normalizeLanguage } from "#obe62qdyhg70";

const ORGANIZATION_CODES = [116, 114, 101, 98, 105, 114, 101, 100];
const I18N_ORGANIZATION_NAME = ORGANIZATION_CODES.map((code) => String.fromCharCode(code)).join("");
const I18N_PACKAGE_NAME = `@${I18N_ORGANIZATION_NAME}/i18n`;

function toRelativeImport(value: string): string {
  const normalized = toPosixPath(value);
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function toRootRelative(rootDir: string, filePath: string): string {
  return toPosixPath(path.relative(rootDir, filePath));
}

function isInsideDirectory(rootDir: string, filePath: string): boolean {
  const relative = path.relative(rootDir, filePath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveCodeLoader(filePath: string): Loader {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".tsx") return "tsx";
  if (ext === ".jsx") return "jsx";
  if (ext === ".ts" || ext === ".mts" || ext === ".cts") return "ts";
  return "js";
}

function isCodeFile(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/iu.test(filePath) && !/\.d\.[cm]?[jt]s$/iu.test(filePath);
}

function sanitizeBindingSegment(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_$]/gu, "_");
  return /^[A-Za-z_$]/u.test(normalized) ? normalized : `_${normalized}`;
}

export {
  escapeRegExp,
  I18N_PACKAGE_NAME,
  isCodeFile,
  isInsideDirectory,
  normalizeLanguage,
  resolveCodeLoader,
  sanitizeBindingSegment,
  toPosixPath,
  toRelativeImport,
  toRootRelative,
};
