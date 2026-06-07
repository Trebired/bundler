import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { walkImportGraph } from "./import-graph.js";
import type {
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
const VIRTUAL_ENTRY_PREFIX = "trebired-virtual:";

type NormalizedDiscoverRule = {
  exclude: string[];
  include: string[];
  key: string;
  maxBundleSize?: number;
  strategy: BundlerDiscoverRuleStrategy;
};

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

function parseBundleMaxSize(value: BundlerDiscoverRule["maxBundleSize"]): number {
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

  if (rule.strategy !== "bundle" && rule.maxBundleSize != null) {
    throw new Error(`bundler-discover-rule-invalid-max-size-strategy :: ${key}`);
  }

  return {
    exclude,
    include,
    key,
    maxBundleSize: rule.strategy === "bundle" ? parseBundleMaxSize(rule.maxBundleSize) : undefined,
    strategy: rule.strategy,
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

function createStableBundleId(value: string): string {
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

function resolveBundleLoader(filePath: string): BundlerVirtualEntryLoader | undefined {
  if (/\.(?:css|scss)$/i.test(filePath)) return "css";
  if (/\.(?:[mc]?[jt]sx?)$/i.test(filePath)) return "ts";
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
      entries: bootEntry.entrySource!,
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

    for (const rule of config.rules) {
      rules.set(rule.key, {
        entryKeys: [],
        ignoredSources: [],
        ruleKey: rule.key,
        strategy: rule.strategy,
      });
      matchedByRule.set(rule.key, []);
    }

    for (const file of files) {
      const matchedRule = classifyFile({
        config,
        file,
      });

      if (!matchedRule) {
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
          sourceOwners.set(file.rootRel, record.key);
        }

        continue;
      }

      const filesWithStats = await Promise.all(matchedFiles.map(async (file) => {
        const stats = await fsp.stat(file.absPath);
        const bytes = Math.max(stats.size, 1);

        if (bytes > rule.maxBundleSize!) {
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
      const stableId = createStableBundleId(JSON.stringify({
        dir: config.dir,
        ruleKey: rule.key,
        sources: filesWithStats.map((file) => file.rootRel),
      }));
      const chunks = splitByMaxSize({
        files: filesWithStats.sort((a, b) => a.rootRel.localeCompare(b.rootRel)),
        maxBundleSize: rule.maxBundleSize!,
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
          sourceOwners.set(sourcePath, key);
        }
      });
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
        entrySource: entry.entrySource,
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
  NormalizedDiscoverOptions,
  NormalizedDiscoverRule,
  NormalizedManifestOptions,
  ResolvedDiscovery,
};
