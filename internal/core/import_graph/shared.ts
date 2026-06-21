import path from "node:path";

import { toPosixPath } from "#c16c81be3058";

const DEFAULT_IMPORT_GRAPH_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".scss",
  ".css",
  ".json",
];

const IMPORT_FROM_RE = /\bimport\s+(?:type\s+)?(?:[\w*\s{},]+?)\s+from\s+["']([^"']+)["']/g;
const IMPORT_SIDE_EFFECT_RE = /\bimport\s+["']([^"']+)["']/g;
const EXPORT_FROM_RE = /\bexport\s+(?:type\s+)?(?:[\w*\s{},]+?)\s+from\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

type LoadedTsconfig = {
  baseUrlAbs?: string;
  matchers: TsconfigPathMatcher[];
};

type TsconfigPathMatcher = {
  key: string;
  prefix: string;
  suffix: string;
  hasWildcard: boolean;
  targets: string[];
};

function normalizeKey(value: unknown): string {
  return toPosixPath(String(value || "").trim()).replace(/^\.\/+/, "");
}

function normalizePathInRoot(rootDir: string, value: string): string {
  return normalizeKey(path.relative(rootDir, value));
}

export {
  DEFAULT_IMPORT_GRAPH_EXTENSIONS,
  DYNAMIC_IMPORT_RE,
  EXPORT_FROM_RE,
  IMPORT_FROM_RE,
  IMPORT_SIDE_EFFECT_RE,
  normalizeKey,
  normalizePathInRoot,
};
export type {
  LoadedTsconfig,
  TsconfigPathMatcher,
};
