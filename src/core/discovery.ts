import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { walkImportGraph } from "./import-graph.js";
import type {
  BundlerAggregateEntryMetadata,
  BundlerAggregateModuleMap,
  BundlerAggregateRuleMetadata,
  BundlerDiscoverAggregateRule,
  BundlerDiscoverBundleRule,
  BundlerDiscoverEntryRule,
  BundlerDiscoverIgnoreRule,
  BundlerDiscoverOptions,
  BundlerDiscoverRule,
  BundlerDiscoverRuleStrategy,
  BundlerEntryRecord,
  BundlerManifestOptions,
  BundlerOptions,
  BundlerResolvedDiscovery,
  BundlerResolvedRule,
  BundlerVirtualEntryLoader,
} from "../types.js";

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
const MODULE_RESOLVE_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
];

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

    if (char === "*" && next === "*" && afterNext === "/") {
      source += "(?:.*/)?";
      index += 2;
      continue;
    }

    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += ".";
      continue;
    }

    if (/[|\\{}()[\]^$+?.]/.test(char)) {
      source += `\\${char}`;
      continue;
    }

    source += char;
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
  if (!match) {
    throw new Error("bundler-discover-bundle-invalid-max-size");
  }

  const amount = Number(match[1]);
  const unit = (match[2] || "b").toLowerCase();
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

function normalizeStringList(values: string[] | undefined): string[] {
  return (values || []).map(normalizePathValue).filter(Boolean);
}

function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value);
}

function normalizeAggregateModuleMap(
  aggregate: BundlerAggregateModuleMap | undefined,
  ruleKey: string,
): NormalizedAggregateModuleMap {
  if (!aggregate) {
    throw new Error(`bundler-discover-aggregate-missing-config :: ${ruleKey}`);
  }

  if (aggregate.kind !== "module-map") {
    throw new Error(`bundler-discover-aggregate-unsupported-kind :: ${ruleKey}`);
  }

  const keyFromPath = aggregate.keyFromPath || DEFAULT_AGGREGATE_KEY_FROM_PATH;
  if (keyFromPath !== "relative-path") {
    throw new Error(`bundler-discover-aggregate-invalid-key-from-path :: ${ruleKey}`);
  }

  const rootModule = aggregate.rootModule ? normalizePathValue(aggregate.rootModule) : undefined;
  const rootModuleExportName = String(aggregate.rootModuleExportName || DEFAULT_AGGREGATE_ROOT_EXPORT_NAME).trim();
  const matchedModuleExportName = String(
    aggregate.matchedModuleExportName || DEFAULT_AGGREGATE_MATCHED_EXPORT_NAME,
  ).trim();
  const mapExport = String(aggregate.exports?.map || DEFAULT_AGGREGATE_MAP_EXPORT).trim();
  const resolverExport = String(aggregate.exports?.resolver || DEFAULT_AGGREGATE_RESOLVER_EXPORT).trim();
  const rootExport = aggregate.exports?.root
    ? String(aggregate.exports.root).trim()
    : DEFAULT_AGGREGATE_ROOT_BINDING_EXPORT;

  for (const [label, value] of [
    ["map", mapExport],
    ["resolver", resolverExport],
    ["root", rootExport],
  ] as const) {
    if (!isValidIdentifier(value)) {
      throw new Error(`bundler-discover-aggregate-invalid-export-name :: ${ruleKey} :: ${label}`);
    }
  }

  const namedExports = [mapExport, resolverExport, rootExport];
  if (new Set(namedExports).size !== namedExports.length) {
    throw new Error(`bundler-discover-aggregate-duplicate-export-name :: ${ruleKey}`);
  }

  return {
    allowEmpty: Boolean(aggregate.allowEmpty),
    collapseIndex: Boolean(aggregate.collapseIndex),
    exports: {
      default: aggregate.exports?.default ?? DEFAULT_AGGREGATE_EXPORT_DEFAULT,
      map: mapExport,
      resolver: resolverExport,
      root: rootModule ? rootExport : undefined,
    },
    keyFromPath,
    kind: "module-map",
    matchedModuleExportName,
    rootModule,
    rootModuleExportName,
  };
}

function normalizeDiscoverRule(rule: BundlerDiscoverRule): NormalizedDiscoverRule {
  const key = normalizePathValue(rule.key);
  const include = normalizeStringList(rule.include);
  const exclude = normalizeStringList(rule.exclude);

  if (!key) {
    throw new Error("bundler-discover-rule-missing-key");
  }

  if (include.length === 0) {
    throw new Error(`bundler-discover-rule-missing-include :: ${key}`);
  }

  if (rule.strategy === "entry") {
    if ("maxBundleSize" in rule && (rule as { maxBundleSize?: unknown }).maxBundleSize != null) {
      throw new Error(`bundler-discover-rule-invalid-max-size-strategy :: ${key}`);
    }
    if ("aggregate" in rule && (rule as { aggregate?: unknown }).aggregate != null) {
      throw new Error(`bundler-discover-rule-invalid-aggregate-strategy :: ${key}`);
    }
    return {
      exclude,
      include,
      key,
      strategy: "entry",
    };
  }

  if (rule.strategy === "bundle") {
    if ("aggregate" in rule && (rule as { aggregate?: unknown }).aggregate != null) {
      throw new Error(`bundler-discover-rule-invalid-aggregate-strategy :: ${key}`);
    }
    return {
      exclude,
      include,
      key,
      maxBundleSize: parseBundleMaxSize(rule.maxBundleSize),
      strategy: "bundle",
    };
  }

  if (rule.strategy === "ignore") {
    if ("maxBundleSize" in rule && (rule as { maxBundleSize?: unknown }).maxBundleSize != null) {
      throw new Error(`bundler-discover-rule-invalid-max-size-strategy :: ${key}`);
    }
    if ("aggregate" in rule && (rule as { aggregate?: unknown }).aggregate != null) {
      throw new Error(`bundler-discover-rule-invalid-aggregate-strategy :: ${key}`);
    }
    return {
      exclude,
      include,
      key,
      strategy: "ignore",
    };
  }

  if ("maxBundleSize" in rule && (rule as { maxBundleSize?: unknown }).maxBundleSize != null) {
    throw new Error(`bundler-discover-rule-invalid-max-size-strategy :: ${key}`);
  }

  return {
    aggregate: normalizeAggregateModuleMap(rule.aggregate, key),
    exclude,
    include,
    key,
    strategy: "aggregate",
  };
}

function normalizeDiscoverOptions(
  rootDir: string,
  discover: BundlerOptions["discover"],
): NormalizedDiscoverOptions[] {
  const list = Array.isArray(discover) ? discover : discover ? [discover] : [];

  if (list.length === 0) {
    throw new Error("bundler-missing-discover");
  }

  const normalized = list
    .map((item) => item && typeof item === "object" ? item : null)
    .filter(Boolean)
    .map((item) => {
      const dir = normalizePathValue(item!.dir);
      if (!dir) {
        throw new Error("bundler-discover-missing-dir");
      }

      const rules = (item!.rules || []).map(normalizeDiscoverRule);
      if (rules.length === 0) {
        throw new Error(`bundler-discover-missing-rules :: ${dir}`);
      }

      return {
        dir,
        dirAbs: path.resolve(rootDir, dir),
        ignoreDirs: new Set([
          ...DEFAULT_IGNORE_DIRS,
          ...normalizeStringList(item!.ignoreDirs),
        ].map((value) => path.basename(value))),
        rules,
      };
    });

  const seenRuleKeys = new Set<string>();
  for (const config of normalized) {
    for (const rule of config.rules) {
      if (seenRuleKeys.has(rule.key)) {
        throw new Error(`bundler-discover-duplicate-rule-key :: ${rule.key}`);
      }
      seenRuleKeys.add(rule.key);
    }
  }

  return normalized;
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

function buildBundleContents(args: {
  files: DiscoveredFile[];
  loader: BundlerVirtualEntryLoader;
  rootDir: string;
}): string {
  if (args.loader === "css") {
    return args.files
      .map((file) => `@import ${JSON.stringify(toRootImportSpecifier(args.rootDir, file.absPath))};`)
      .join("\n");
  }

  return args.files
    .map((file) => `import ${JSON.stringify(toRootImportSpecifier(args.rootDir, file.absPath))};`)
    .join("\n");
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

async function scanDiscoveredFiles(config: NormalizedDiscoverOptions, rootDir: string): Promise<DiscoveredFile[]> {
  if (!fs.existsSync(config.dirAbs)) return [];

  const files: DiscoveredFile[] = [];

  const visit = async (currentAbs: string): Promise<void> => {
    const entries = await fsp.readdir(currentAbs, { withFileTypes: true });

    for (const entry of entries) {
      const abs = path.join(currentAbs, entry.name);
      const discoverRel = normalizePathValue(path.relative(config.dirAbs, abs));
      if (!discoverRel) continue;

      if (entry.isDirectory()) {
        if (config.ignoreDirs.has(entry.name)) continue;
        await visit(abs);
        continue;
      }

      if (!entry.isFile()) continue;

      files.push({
        absPath: abs,
        discoverRel,
        rootRel: normalizePathValue(path.relative(rootDir, abs)),
      });
    }
  };

  await visit(config.dirAbs);
  return files.sort((a, b) => a.rootRel.localeCompare(b.rootRel));
}

function classifyFile(args: {
  config: NormalizedDiscoverOptions;
  file: DiscoveredFile;
}): NormalizedDiscoverRule | undefined {
  return args.config.rules.find((rule) => {
    if (!matchesAnyPattern(args.file.discoverRel, rule.include)) return false;
    if (matchesAnyPattern(args.file.discoverRel, rule.exclude)) return false;
    return true;
  });
}

function splitByMaxSize(args: {
  files: Array<DiscoveredFile & { bytes: number }>;
  maxBundleSize: number;
}): Array<Array<DiscoveredFile & { bytes: number }>> {
  const chunks: Array<Array<DiscoveredFile & { bytes: number }>> = [];
  let current: Array<DiscoveredFile & { bytes: number }> = [];
  let currentSize = 0;

  for (const file of args.files) {
    const nextSize = currentSize + file.bytes;

    if (current.length > 0 && nextSize > args.maxBundleSize) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }

    current.push(file);
    currentSize += file.bytes;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
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
    if (segments.every((parts) => parts[index] === segment)) {
      shared.push(segment);
      continue;
    }
    break;
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
  if (stable.length === parts.length) {
    return toPosixDirname(stable.join("/"));
  }

  return stable.join("/");
}

function computeAggregateKeyRoot(includePatterns: string[], matchedFiles: DiscoveredFile[]): string {
  const includeBase = commonPathPrefix(includePatterns.map(staticPatternBase).filter(Boolean));
  if (includeBase) return includeBase;

  return commonPathPrefix(matchedFiles.map((file) => toPosixDirname(file.discoverRel)).filter(Boolean));
}

function normalizeAggregatePathKey(args: {
  collapseIndex: boolean;
  file: DiscoveredFile;
  keyRoot: string;
}): string {
  const fromRoot = args.keyRoot
    ? normalizePathValue(path.posix.relative(args.keyRoot, args.file.discoverRel))
    : normalizePathValue(args.file.discoverRel);
  const ext = path.extname(fromRoot);
  let withoutExt = ext ? fromRoot.slice(0, -ext.length) : fromRoot;

  if (args.collapseIndex && withoutExt.endsWith("/index")) {
    withoutExt = withoutExt.slice(0, -"/index".length);
  }

  return normalizePathValue(withoutExt);
}

function validateAggregatePathKeys(args: {
  collapseIndex: boolean;
  matchedFiles: DiscoveredFile[];
  rule: NormalizedAggregateRule;
}): void {
  const keyRoot = computeAggregateKeyRoot(args.rule.include, args.matchedFiles);
  const seen = new Map<string, string>();

  for (const file of args.matchedFiles) {
    const pathKey = normalizeAggregatePathKey({
      collapseIndex: args.collapseIndex,
      file,
      keyRoot,
    });
    const existing = seen.get(pathKey);

    if (existing && existing !== file.rootRel) {
      throw new Error(`bundler-discover-aggregate-path-key-conflict :: ${args.rule.key} :: ${pathKey}`);
    }

    seen.set(pathKey, file.rootRel);
  }
}

function createAggregateEntryMetadata(args: {
  matchedFiles: DiscoveredFile[];
  rootModule?: ResolvedAggregateRootModule;
}): BundlerAggregateEntryMetadata {
  return {
    kind: "module-map",
    matchedSources: args.matchedFiles.map((file) => file.rootRel),
    rootModule: args.rootModule?.rootRel,
  };
}

function createAggregateRuleMetadata(rootModule?: ResolvedAggregateRootModule): BundlerAggregateRuleMetadata {
  return {
    kind: "module-map",
    rootModule: rootModule?.rootRel,
  };
}

function buildAggregateModuleMapContents(args: {
  aggregate: NormalizedAggregateModuleMap;
  includePatterns: string[];
  matchedFiles: DiscoveredFile[];
  rootDir: string;
  rootModule?: ResolvedAggregateRootModule;
}): string {
  const mapBinding = "__bundler_module_map";
  const resolverBinding = "__bundler_get_module";
  const rootBinding = "__bundler_root_module";
  const lines: string[] = [];
  const actualKeyRoot = computeAggregateKeyRoot(args.includePatterns, args.matchedFiles);

  if (args.rootModule) {
    lines.push(`import * as __bundler_root_namespace from ${JSON.stringify(toRootImportSpecifier(args.rootDir, args.rootModule.absPath))};`);
  }

  args.matchedFiles.forEach((file, index) => {
    lines.push(`import * as __bundler_module_${index} from ${JSON.stringify(toRootImportSpecifier(args.rootDir, file.absPath))};`);
  });

  lines.push("");

  if (args.rootModule) {
    lines.push(`const ${rootBinding} = __bundler_root_namespace[${JSON.stringify(args.aggregate.rootModuleExportName)}];`);
    lines.push("");
  }

  lines.push(`const ${mapBinding} = {`);
  args.matchedFiles.forEach((file, index) => {
    lines.push(
      `  ${JSON.stringify(normalizeAggregatePathKey({
        collapseIndex: args.aggregate.collapseIndex,
        file,
        keyRoot: actualKeyRoot,
      }))}: __bundler_module_${index}[${JSON.stringify(args.aggregate.matchedModuleExportName)}],`,
    );
  });
  lines.push("};");
  lines.push("");
  lines.push(`function ${resolverBinding}(key) {`);
  lines.push(`  return ${mapBinding}[key];`);
  lines.push("}");
  lines.push("");

  const exportSpecifiers = [
    `${mapBinding} as ${args.aggregate.exports.map}`,
    `${resolverBinding} as ${args.aggregate.exports.resolver}`,
  ];

  if (args.rootModule && args.aggregate.exports.root) {
    exportSpecifiers.push(`${rootBinding} as ${args.aggregate.exports.root}`);
  }

  lines.push(`export { ${exportSpecifiers.join(", ")} };`);

  if (args.aggregate.exports.default) {
    const defaultMembers = [
      `${args.aggregate.exports.map}: ${mapBinding}`,
      `${args.aggregate.exports.resolver}: ${resolverBinding}`,
    ];

    if (args.rootModule && args.aggregate.exports.root) {
      defaultMembers.push(`${args.aggregate.exports.root}: ${rootBinding}`);
    }

    lines.push("");
    lines.push(`export default { ${defaultMembers.join(", ")} };`);
  }

  return lines.join("\n");
}

function resolveModuleCandidate(basePath: string): string | undefined {
  for (const extension of MODULE_RESOLVE_EXTENSIONS) {
    const directCandidate = `${basePath}${extension}`;
    if (directCandidate && fs.existsSync(directCandidate) && fs.statSync(directCandidate).isFile()) {
      return directCandidate;
    }
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const extension of MODULE_RESOLVE_EXTENSIONS.filter(Boolean)) {
      const indexCandidate = path.join(basePath, `index${extension}`);
      if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
        return indexCandidate;
      }
    }
  }

  return undefined;
}

function resolveAggregateRootModule(args: {
  config: NormalizedDiscoverOptions;
  rootDir: string;
  rule: NormalizedAggregateRule;
}): ResolvedAggregateRootModule | undefined {
  if (!args.rule.aggregate.rootModule) return undefined;

  const raw = args.rule.aggregate.rootModule;
  const basePath = path.isAbsolute(raw) ? raw : path.resolve(args.config.dirAbs, raw);
  const resolved = resolveModuleCandidate(basePath);

  if (!resolved) {
    throw new Error(`bundler-discover-aggregate-root-module-not-found :: ${args.rule.key} :: ${raw}`);
  }

  const rootRel = normalizePathValue(path.relative(args.rootDir, resolved));
  if (!resolveAggregateModuleLoader(rootRel)) {
    throw new Error(`bundler-discover-aggregate-unsupported-root-module :: ${args.rule.key} :: ${rootRel}`);
  }

  return {
    absPath: resolved,
    rootRel,
  };
}

function assignSourceOwner(args: {
  entryKey: string;
  sourceOwners: Map<string, string>;
  sourcePath: string;
}): void {
  const existing = args.sourceOwners.get(args.sourcePath);
  if (existing && existing !== args.entryKey) {
    throw new Error(`bundler-discover-source-owner-conflict :: ${args.sourcePath}`);
  }

  args.sourceOwners.set(args.sourcePath, args.entryKey);
}

async function validateGroupedBootImports(args: {
  entries: BundlerEntryRecord[];
  rootDir: string;
}): Promise<void> {
  const groupedScriptSources = new Set(
    args.entries
      .filter((entry) => entry.strategy === "bundle" && entry.virtualLoader === "ts")
      .flatMap((entry) => entry.ownedSources),
  );

  if (groupedScriptSources.size === 0) return;

  const bootEntries = args.entries.filter((entry) => {
    if (entry.strategy !== "entry" || !entry.entrySource) return false;
    return /\.(?:client\.tsx?|defer\.ts)$/i.test(entry.entrySource);
  });

  for (const bootEntry of bootEntries) {
    const graph = await walkImportGraph({
      entries: bootEntry.entrySource,
      rootDir: args.rootDir,
    });

    const groupedDependency = Object.keys(graph.files)
      .sort()
      .find((sourcePath) => sourcePath !== bootEntry.entrySource && groupedScriptSources.has(sourcePath));

    if (groupedDependency) {
      throw new Error(`bundler-discover-entry-imports-grouped-source :: ${bootEntry.entrySource} -> ${groupedDependency}`);
    }
  }
}

async function resolveBundlerEntries(
  options: BundlerOptions,
  rootDir: string,
  settings: { allowEmpty?: boolean } = {},
): Promise<ResolvedDiscovery> {
  const configs = normalizeDiscoverOptions(rootDir, options.discover);
  const resolvedEntries: BundlerEntryRecord[] = [];
  const rules = new Map<string, BundlerResolvedRule>();
  const sourceOwners = new Map<string, string>();
  const emittedNames = new Set<string>();
  const emittedKeys = new Set<string>();

  for (const config of configs) {
    const files = await scanDiscoveredFiles(config, rootDir);
    const matchedByRule = new Map<string, DiscoveredFile[]>();
    const aggregateRootModules = new Map<string, ResolvedAggregateRootModule>();

    for (const rule of config.rules) {
      const ruleRecord: BundlerResolvedRule = {
        entryKeys: [],
        ignoredSources: [],
        ruleKey: rule.key,
        strategy: rule.strategy,
      };

      if (rule.strategy === "aggregate") {
        const rootModule = resolveAggregateRootModule({
          config,
          rootDir,
          rule,
        });

        if (rootModule) {
          aggregateRootModules.set(rule.key, rootModule);
          ruleRecord.aggregate = createAggregateRuleMetadata(rootModule);
        } else {
          ruleRecord.aggregate = createAggregateRuleMetadata();
        }
      }

      rules.set(rule.key, ruleRecord);
      matchedByRule.set(rule.key, []);
    }

    const reservedAggregateRoots = new Set(
      Array.from(aggregateRootModules.values())
        .filter((item) => item.rootRel.startsWith(`${config.dir}/`) || item.rootRel === config.dir)
        .map((item) => item.rootRel),
    );

    for (const file of files) {
      const matchedRule = classifyFile({
        config,
        file,
      });

      if (!matchedRule) {
        if (reservedAggregateRoots.has(file.rootRel)) {
          continue;
        }
        throw new Error(`bundler-discover-unmatched-file :: ${file.rootRel}`);
      }

      matchedByRule.get(matchedRule.key)!.push(file);
    }

    for (const rule of config.rules) {
      const matchedFiles = (matchedByRule.get(rule.key) || []).sort((a, b) => a.rootRel.localeCompare(b.rootRel));
      const ruleRecord = rules.get(rule.key)!;

      if (rule.strategy === "ignore") {
        ruleRecord.ignoredSources = matchedFiles.map((file) => file.rootRel);
        continue;
      }

      if (rule.strategy === "entry") {
        for (const file of matchedFiles) {
          const ext = path.extname(file.rootRel);
          const withoutExt = ext ? file.rootRel.slice(0, -ext.length) : file.rootRel;
          const record: BundlerEntryRecord = {
            entrySource: file.rootRel,
            generated: false,
            key: buildEntryKey({
              rootRel: file.rootRel,
              ruleKey: rule.key,
            }),
            kind: "entry",
            name: normalizePathValue(withoutExt),
            ownedSources: [file.rootRel],
            path: file.absPath,
            ruleKey: rule.key,
            source: "discover",
            strategy: "entry",
          };

          if (emittedKeys.has(record.key)) {
            throw new Error(`bundler-discover-entry-key-conflict :: ${record.key}`);
          }
          if (emittedNames.has(record.name)) {
            throw new Error(`bundler-discover-output-name-conflict :: ${record.name}`);
          }

          emittedKeys.add(record.key);
          emittedNames.add(record.name);
          resolvedEntries.push(record);
          ruleRecord.entryKeys.push(record.key);
          assignSourceOwner({
            entryKey: record.key,
            sourceOwners,
            sourcePath: file.rootRel,
          });
        }

        continue;
      }

      if (rule.strategy === "bundle") {
        const filesWithStats = await Promise.all(matchedFiles.map(async (file) => {
          const stats = await fsp.stat(file.absPath);
          const bytes = Math.max(stats.size, 1);

          if (bytes > rule.maxBundleSize) {
            throw new Error(`bundler-discover-bundle-file-too-large :: ${file.rootRel}`);
          }

          return {
            ...file,
            bytes,
          };
        }));

        if (filesWithStats.length === 0) {
          continue;
        }

        const loaders = new Set(filesWithStats.map((file) => resolveBundleLoader(file.rootRel)).filter(Boolean));
        if (loaders.size !== 1) {
          throw new Error(`bundler-discover-rule-mixed-loaders :: ${rule.key}`);
        }

        const loader = Array.from(loaders)[0] as BundlerVirtualEntryLoader;
        const stableId = createStableId(JSON.stringify({
          dir: config.dir,
          ruleKey: rule.key,
          sources: filesWithStats.map((file) => file.rootRel),
        }));
        const chunks = splitByMaxSize({
          files: filesWithStats.sort((a, b) => a.rootRel.localeCompare(b.rootRel)),
          maxBundleSize: rule.maxBundleSize,
        });

        chunks.forEach((chunk, index) => {
          const part = index + 1;
          const name = chunks.length === 1 ? `bundle-${stableId}` : `bundle-${stableId}-${part}`;
          const key = buildBundleEntryKey(rule.key, part);
          const ownedSources = chunk.map((file) => file.rootRel);

          if (emittedKeys.has(key)) {
            throw new Error(`bundler-discover-entry-key-conflict :: ${key}`);
          }
          if (emittedNames.has(name)) {
            throw new Error(`bundler-discover-output-name-conflict :: ${name}`);
          }

          emittedKeys.add(key);
          emittedNames.add(name);

          resolvedEntries.push({
            contents: buildBundleContents({
              files: chunk,
              loader,
              rootDir,
            }),
            generated: true,
            key,
            kind: "bundle",
            name,
            ownedSources,
            path: `${VIRTUAL_ENTRY_PREFIX}${name}`,
            ruleKey: rule.key,
            source: "internal",
            strategy: "bundle",
            virtualLoader: loader,
          });

          ruleRecord.entryKeys.push(key);
          for (const sourcePath of ownedSources) {
            assignSourceOwner({
              entryKey: key,
              sourceOwners,
              sourcePath,
            });
          }
        });

        continue;
      }

      const rootModule = aggregateRootModules.get(rule.key);
      const unsupportedFile = matchedFiles.find((file) => !resolveAggregateModuleLoader(file.rootRel));
      if (unsupportedFile) {
        throw new Error(`bundler-discover-aggregate-unsupported-file :: ${rule.key} :: ${unsupportedFile.rootRel}`);
      }

      validateAggregatePathKeys({
        collapseIndex: rule.aggregate.collapseIndex,
        matchedFiles,
        rule,
      });

      if (matchedFiles.length === 0 && !rule.aggregate.allowEmpty) {
        throw new Error(`bundler-discover-aggregate-empty :: ${rule.key}`);
      }

      const key = buildAggregateEntryKey(rule.key);
      const aggregateMetadata = createAggregateEntryMetadata({
        matchedFiles,
        rootModule,
      });
      const stableId = createStableId(JSON.stringify({
        aggregate: rule.aggregate,
        dir: config.dir,
        rootModule: rootModule?.rootRel,
        ruleKey: rule.key,
        sources: aggregateMetadata.matchedSources,
      }));
      const name = `aggregate-${stableId}`;
      const ownedSources = [
        ...aggregateMetadata.matchedSources,
        ...(rootModule ? [rootModule.rootRel] : []),
      ].sort();

      if (emittedKeys.has(key)) {
        throw new Error(`bundler-discover-entry-key-conflict :: ${key}`);
      }
      if (emittedNames.has(name)) {
        throw new Error(`bundler-discover-output-name-conflict :: ${name}`);
      }

      emittedKeys.add(key);
      emittedNames.add(name);

      resolvedEntries.push({
        aggregate: aggregateMetadata,
        contents: buildAggregateModuleMapContents({
        aggregate: rule.aggregate,
          includePatterns: rule.include,
          matchedFiles,
          rootDir,
          rootModule,
        }),
        generated: true,
        key,
        kind: "entry",
        name,
        ownedSources,
        path: `${VIRTUAL_ENTRY_PREFIX}${name}`,
        ruleKey: rule.key,
        source: "internal",
        strategy: "aggregate",
        virtualLoader: "ts",
      });

      ruleRecord.entryKeys.push(key);

      for (const sourcePath of ownedSources) {
        assignSourceOwner({
          entryKey: key,
          sourceOwners,
          sourcePath,
        });
      }
    }
  }

  await validateGroupedBootImports({
    entries: resolvedEntries,
    rootDir,
  });

  if (resolvedEntries.length === 0 && !settings.allowEmpty) {
    throw new Error("bundler-missing-entries");
  }

  const discovery: BundlerResolvedDiscovery = {
    entries: resolvedEntries.sort((a, b) => a.key.localeCompare(b.key)),
    rules: Object.fromEntries(Array.from(rules.entries()).sort(([a], [b]) => a.localeCompare(b))),
    sourceOwners: Object.fromEntries(Array.from(sourceOwners.entries()).sort(([a], [b]) => a.localeCompare(b))),
  };

  return {
    ...discovery,
    signature: JSON.stringify({
      entries: discovery.entries.map((entry) => ({
        aggregate: entry.aggregate,
        entrySource: entry.entrySource,
        generated: entry.generated,
        key: entry.key,
        kind: entry.kind,
        name: entry.name,
        ownedSources: entry.ownedSources,
        path: entry.source === "internal" ? `virtual:${entry.name}` : entry.path,
        ruleKey: entry.ruleKey,
        strategy: entry.strategy,
      })),
      rules: discovery.rules,
      sourceOwners: discovery.sourceOwners,
    }),
  };
}

function toEntryPointMap(records: BundlerEntryRecord[], rootDir: string): Record<string, string> {
  return Object.fromEntries(
    records.map((record) => [
      record.name,
      record.source === "internal"
        ? record.path
        : normalizePathValue(path.relative(rootDir, record.path)),
    ]),
  );
}

function normalizeManifestOptions(manifest: BundlerManifestOptions | undefined): NormalizedManifestOptions {
  if (!manifest) {
    return { enabled: false };
  }

  if (manifest === true) {
    return {
      enabled: true,
      file: "bundler-manifest.json",
    };
  }

  return {
    enabled: true,
    file: normalizePathValue(manifest.file || "bundler-manifest.json"),
  };
}

function normalizeDiscoverRoots(rootDir: string, discover: BundlerOptions["discover"]): string[] {
  const roots = normalizeDiscoverOptions(rootDir, discover).map((item) => {
    let current = item.dirAbs;

    while (!fs.existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) return rootDir;
      current = parent;
    }

    return current;
  });

  return Array.from(new Set(roots));
}

export {
  normalizeDiscoverRoots,
  normalizeManifestOptions,
  resolveBundlerEntries,
  toEntryPointMap,
  toPosixPath,
  VIRTUAL_ENTRY_PREFIX,
};
export type {
  NormalizedAggregateModuleMap,
  NormalizedDiscoverOptions,
  NormalizedDiscoverRule,
  NormalizedManifestOptions,
  ResolvedDiscovery,
};
