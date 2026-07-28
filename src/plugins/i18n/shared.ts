import path from "node:path";
import type { Loader } from "esbuild";

const ORGANIZATION_CODES = [116, 114, 101, 98, 105, 114, 101, 100];
const I18N_PACKAGE_NAME = `@${packageOrganization()}/i18n`;

function normalizeLanguage(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/_/gu, "-") : "";
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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

function packageOrganization(): string {
  return ORGANIZATION_CODES.map((code) => String.fromCharCode(code)).join("");
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
