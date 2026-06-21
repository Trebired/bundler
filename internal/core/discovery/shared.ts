import fs from "node:fs";
import path from "node:path";

import type {
  BundlerAggregateModuleMap,
  BundlerDiscoverBundleRule,
  BundlerDiscoverRule,
  BundlerEntryRecord,
  BundlerManifestOptions,
  BundlerOptions,
  BundlerResolvedDiscovery,
  BundlerResolvedRule,
  BundlerVirtualEntryLoader,
} from "#jb343639kom2";

const DEFAULT_DISCOVERY_BUNDLE_MAX_SIZE = 50 * 1024 * 1024;
const DEFAULT_IGNORE_DIRS = [".git", "coverage", "dist", "node_modules"];
const DEFAULT_AGGREGATE_MATCHED_EXPORT_NAME = "default";
const DEFAULT_AGGREGATE_ROOT_EXPORT_NAME = "default";
const DEFAULT_AGGREGATE_MAP_EXPORT = "modules";
const DEFAULT_AGGREGATE_RESOLVER_EXPORT = "getModule";
const DEFAULT_AGGREGATE_ROOT_BINDING_EXPORT = "rootModule";
const DEFAULT_AGGREGATE_KEY_FROM_PATH = "relative-path";
const DEFAULT_AGGREGATE_EXPORT_DEFAULT = true;
const VIRTUAL_ENTRY_PREFIX = "trebired-virtual:";
const MODULE_RESOLVE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

type NormalizedAggregateModuleMap = {
  allowEmpty: boolean;
  collapseIndex: boolean;
  exports: {
    default: boolean;
    map: string;
    resolver: string;
    root?: string;
  };
  kind: "module-map";
  keyFromPath: "relative-path";
  matchedModuleExportName: string;
  rootModule?: string;
  rootModuleExportName: string;
};

type NormalizedEntryRule = {
  exclude: string[];
  include: string[];
  key: string;
  strategy: "entry";
};

type NormalizedBundleRule = {
  exclude: string[];
  include: string[];
  key: string;
  maxBundleSize: number;
  strategy: "bundle";
};

type NormalizedIgnoreRule = {
  exclude: string[];
  include: string[];
  key: string;
  strategy: "ignore";
};

type NormalizedAggregateRule = {
  aggregate: NormalizedAggregateModuleMap;
  exclude: string[];
  include: string[];
  key: string;
  strategy: "aggregate";
};

type NormalizedDiscoverRule =
  | NormalizedEntryRule
  | NormalizedBundleRule
  | NormalizedIgnoreRule
  | NormalizedAggregateRule;

type NormalizedDiscoverOptions = {
  dir: string;
  dirAbs: string;
  ignoreDirs: Set<string>;
  rules: NormalizedDiscoverRule[];
};

type DiscoveredFile = {
  absPath: string;
  discoverRel: string;
  rootRel: string;
};

type ResolvedDiscovery = BundlerResolvedDiscovery & {
  signature: string;
};

type NormalizedManifestOptions = {
  enabled: boolean;
  file?: string;
};

type ResolvedAggregateRootModule = {
  absPath: string;
  rootRel: string;
};

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizePathValue(value: string): string {
  return toPosixPath(String(value || "").trim()).replace(/^\.\/+/, "").replace(/^\/+|\/+$/g, "");
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePathValue(pattern);
  let source = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    const afterNext = normalized[index + 2];
    source += resolveGlobToken(char, next, afterNext);
    if (char === "*" && next === "*" && afterNext === "/") index += 2;
    else if (char === "*" && next === "*") index += 1;
  }

  return new RegExp(`^${source}$`);
}

function matchesAnyPattern(value: string, patterns: string[]): boolean {
  if (!patterns.length) return false;
  const normalized = normalizePathValue(value);
  const base = path.basename(normalized);

  return patterns.some((pattern) => {
    const normalizedPattern = normalizePathValue(pattern);
    if (!normalizedPattern) return false;
    if (normalizedPattern === normalized || normalizedPattern === base) return true;
    return globToRegExp(normalizedPattern).test(normalized);
  });
}

function parseBundleMaxSize(value: BundlerDiscoverBundleRule["maxBundleSize"]): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("bundler-discover-bundle-invalid-max-size");
    }

    return Math.floor(value);
  }

  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_DISCOVERY_BUNDLE_MAX_SIZE;
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!match) throw new Error("bundler-discover-bundle-invalid-max-size");
  return resolveBundleSizeMatch(match[1], match[2] || "b");
}

function normalizeStringList(values: string[] | undefined): string[] {
  return (values || []).map(normalizePathValue).filter(Boolean);
}

function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value);
}

function createStableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function toRootImportSpecifier(rootDir: string, absPath: string): string {
  const rel = normalizePathValue(path.relative(rootDir, absPath));
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function buildEntryKey(args: {
  rootRel: string;
  ruleKey: string;
}): string {
  const ext = path.extname(args.rootRel);
  const withoutExt = ext ? args.rootRel.slice(0, -ext.length) : args.rootRel;
  return `entry:${args.ruleKey}:${normalizePathValue(withoutExt)}`;
}

function buildBundleEntryKey(ruleKey: string, part: number): string {
  return `bundle:${ruleKey}:${part}`;
}

function buildAggregateEntryKey(ruleKey: string): string {
  return `aggregate:${ruleKey}`;
}

function resolveBundleLoader(filePath: string): BundlerVirtualEntryLoader | undefined {
  if (/\.(?:css|scss)$/i.test(filePath)) return "css";
  if (/\.(?:[mc]?[jt]sx?)$/i.test(filePath) && !/\.d\.[mc]?[jt]s$/i.test(filePath)) return "ts";
  return undefined;
}

function resolveAggregateModuleLoader(filePath: string): BundlerVirtualEntryLoader | undefined {
  if (/\.(?:[mc]?[jt]sx?)$/i.test(filePath) && !/\.d\.[mc]?[jt]s$/i.test(filePath)) return "ts";
  return undefined;
}

function resolveModuleCandidate(basePath: string): string | undefined {
  for (const extension of MODULE_RESOLVE_EXTENSIONS) {
    const directCandidate = `${basePath}${extension}`;
    if (directCandidate && fs.existsSync(directCandidate) && fs.statSync(directCandidate).isFile()) return directCandidate;
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const extension of MODULE_RESOLVE_EXTENSIONS.filter(Boolean)) {
      const indexCandidate = path.join(basePath, `index${extension}`);
      if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) return indexCandidate;
    }
  }

  return undefined;
}

function toPosixDirname(value: string): string {
  const normalized = normalizePathValue(value);
  if (!normalized) return "";
  const dirname = path.posix.dirname(normalized);
  return dirname === "." ? "" : dirname;
}

function commonPathPrefix(values: string[]): string {
  const normalizedValues = values.map(normalizePathValue).filter(Boolean);
  if (normalizedValues.length === 0) return "";
  const segments = normalizedValues.map((value) => value.split("/").filter(Boolean));
  const shared: string[] = [];
  const smallest = Math.min(...segments.map((parts) => parts.length));

  for (let index = 0; index < smallest; index += 1) {
    const segment = segments[0][index];
    if (!segments.every((parts) => parts[index] === segment)) break;
    shared.push(segment);
  }

  return shared.join("/");
}

function staticPatternBase(pattern: string): string {
  const normalized = normalizePathValue(pattern);
  if (!normalized) return "";
  const parts = normalized.split("/");
  const stable: string[] = [];

  for (const part of parts) {
    if (/[*?]/.test(part)) break;
    stable.push(part);
  }

  if (stable.length === 0) return "";
  return stable.length === parts.length ? toPosixDirname(stable.join("/")) : stable.join("/");
}

function resolveGlobToken(char: string, next?: string, afterNext?: string): string {
  if (char === "*" && next === "*" && afterNext === "/") return "(?:.*/)?";
  if (char === "*" && next === "*") return ".*";
  if (char === "*") return "[^/]*";
  if (char === "?") return ".";
  if (/[|\\{}()[\]^$+?.]/.test(char)) return `\\${char}`;
  return char;
}

function resolveBundleSizeMatch(amountRaw: string, unitRaw: string): number {
  const amount = Number(amountRaw);
  const unit = unitRaw.toLowerCase();
  const multiplier = unit === "gb"
    ? 1024 * 1024 * 1024
    : unit === "mb"
      ? 1024 * 1024
      : unit === "kb"
        ? 1024
        : 1;
  const resolved = Math.floor(amount * multiplier);
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error("bundler-discover-bundle-invalid-max-size");
  }
  return resolved;
}

export {
  buildAggregateEntryKey,
  buildBundleEntryKey,
  buildEntryKey,
  commonPathPrefix,
  createStableId,
  DEFAULT_AGGREGATE_EXPORT_DEFAULT,
  DEFAULT_AGGREGATE_KEY_FROM_PATH,
  DEFAULT_AGGREGATE_MAP_EXPORT,
  DEFAULT_AGGREGATE_MATCHED_EXPORT_NAME,
  DEFAULT_AGGREGATE_RESOLVER_EXPORT,
  DEFAULT_AGGREGATE_ROOT_BINDING_EXPORT,
  DEFAULT_AGGREGATE_ROOT_EXPORT_NAME,
  DEFAULT_DISCOVERY_BUNDLE_MAX_SIZE,
  DEFAULT_IGNORE_DIRS,
  MODULE_RESOLVE_EXTENSIONS,
  normalizePathValue,
  normalizeStringList,
  parseBundleMaxSize,
  resolveAggregateModuleLoader,
  resolveBundleLoader,
  resolveModuleCandidate,
  staticPatternBase,
  toPosixDirname,
  toPosixPath,
  toRootImportSpecifier,
  VIRTUAL_ENTRY_PREFIX,
  globToRegExp,
  isValidIdentifier,
  matchesAnyPattern,
};
export type {
  DiscoveredFile,
  NormalizedAggregateModuleMap,
  NormalizedBundleRule,
  NormalizedAggregateRule,
  NormalizedDiscoverOptions,
  NormalizedDiscoverRule,
  NormalizedManifestOptions,
  ResolvedAggregateRootModule,
  ResolvedDiscovery,
};
