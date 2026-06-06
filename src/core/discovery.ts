import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import type {
  BundlerDiscoverOptions,
  BundlerEntryRecord,
  BundlerManifestOptions,
  BundlerOptions,
  BundlerVirtualEntryLoader,
  BundlerVirtualEntries,
} from "../types.js";

const DEFAULT_DISCOVERY_EXTENSIONS = [".css", ".js", ".jsx", ".scss", ".ts", ".tsx"];
const DEFAULT_IGNORE_DIRS = [".git", "coverage", "dist", "node_modules"];
const DEFAULT_DISCOVERY_BUNDLE_MAX_SIZE = 50 * 1024 * 1024;
const DEFAULT_DISCOVERY_BUNDLE_GROUPS: Array<{
  extensions: string[];
  loader: BundlerVirtualEntryLoader;
  name: string;
}> = [
  {
    name: "scripts",
    extensions: [".js", ".ts"],
    loader: "ts",
  },
  {
    name: "styles",
    extensions: [".css", ".scss"],
    loader: "css",
  },
];
const NORMALIZED_DISCOVERY_BUNDLE_GROUPS: NormalizedDiscoverBundleGroup[] = DEFAULT_DISCOVERY_BUNDLE_GROUPS.map((group) => ({
  ...group,
  extensions: new Set(group.extensions),
}));
const VIRTUAL_ENTRY_PREFIX = "trebired-virtual:";

type NormalizedDiscoverBundleGroup = {
  extensions: Set<string>;
  loader: BundlerVirtualEntryLoader;
  name: string;
};

type NormalizedDiscoverOptions = {
  dir: string;
  dirAbs: string;
  exclude: string[];
  extensions: string[];
  ignoreDirs: Set<string>;
  include: string[];
  maxBundleSize: number;
  namePrefix: string;
};

type ResolvedEntries = {
  duplicates: DuplicateBundlerEntryRecord[];
  records: BundlerEntryRecord[];
  signature: string;
};

type DuplicateBundlerEntryRecord = {
  dropped: BundlerEntryRecord;
  kept: BundlerEntryRecord;
};

type NormalizedManifestOptions = {
  enabled: boolean;
  file?: string;
};

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizePathValue(value: string): string {
  return toPosixPath(String(value || "").trim()).replace(/^\.\/+/, "");
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

function normalizeStringList(values: string[] | undefined): string[] {
  return (values || []).map(normalizePathValue).filter(Boolean);
}

function parseBundleMaxSize(value: BundlerDiscoverOptions["maxBundleSize"]): number {
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

function normalizeDiscoverOptions(
  rootDir: string,
  discover: BundlerOptions["discover"],
): NormalizedDiscoverOptions[] {
  const list = Array.isArray(discover) ? discover : discover ? [discover] : [];

  return list
    .map((item) => item && typeof item === "object" ? item : null)
    .filter(Boolean)
    .map((item) => {
      const dir = normalizePathValue(item!.dir);
      if (!dir) {
        throw new Error("bundler-discover-missing-dir");
      }

      const extensions = (item!.extensions && item!.extensions.length ? item!.extensions : DEFAULT_DISCOVERY_EXTENSIONS)
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
        .map((value) => value.startsWith(".") ? value : `.${value}`);

      return {
        dir,
        dirAbs: path.resolve(rootDir, dir),
        exclude: normalizeStringList(item!.exclude),
        extensions,
        ignoreDirs: new Set([
          ...DEFAULT_IGNORE_DIRS,
          ...normalizeStringList(item!.ignoreDirs),
        ].map((value) => path.basename(value))),
        include: normalizeStringList(item!.include),
        maxBundleSize: parseBundleMaxSize(item!.maxBundleSize),
        namePrefix: normalizePathValue(item!.namePrefix || ""),
      };
    });
}

function normalizeManualEntries(entries: BundlerOptions["entries"], rootDir: string): BundlerEntryRecord[] {
  if (!entries) return [];

  if (Array.isArray(entries)) {
    return entries
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => {
        const rel = normalizePathValue(value);
        const ext = path.extname(rel);
        const noExt = ext ? rel.slice(0, -ext.length) : rel;

        return {
          name: noExt,
          path: path.resolve(rootDir, rel),
          source: "manual" as const,
        };
      });
  }

  if (typeof entries === "object") {
    return Object.entries(entries)
      .map(([key, value]) => ({
        name: normalizePathValue(key),
        path: path.resolve(rootDir, String(value || "").trim()),
        source: "manual" as const,
      }))
      .filter((entry) => Boolean(entry.name && entry.path));
  }

  return [];
}

function normalizeVirtualEntries(virtualEntries: BundlerVirtualEntries | undefined): BundlerEntryRecord[] {
  if (!virtualEntries || typeof virtualEntries !== "object") return [];

  return Object.entries(virtualEntries)
    .map(([key, value]) => ({
      name: normalizePathValue(key),
      path: `${VIRTUAL_ENTRY_PREFIX}${normalizePathValue(key)}`,
      source: "virtual" as const,
      contents: String(value || ""),
    }))
    .filter((entry) => Boolean(entry.name));
}

function resolveEntryPriority(record: BundlerEntryRecord): number {
  if (record.source === "manual") return 0;
  if (record.source === "virtual") return 1;
  return 2;
}

function compareEntries(a: BundlerEntryRecord, b: BundlerEntryRecord): number {
  return resolveEntryPriority(a) - resolveEntryPriority(b)
    || a.name.localeCompare(b.name)
    || a.path.localeCompare(b.path);
}

function dedupeEntriesBySourcePath(records: BundlerEntryRecord[]): {
  duplicates: DuplicateBundlerEntryRecord[];
  records: BundlerEntryRecord[];
} {
  const duplicates: DuplicateBundlerEntryRecord[] = [];
  const keptByPath = new Map<string, BundlerEntryRecord>();

  for (const record of [...records].sort(compareEntries)) {
    if (record.source === "virtual") {
      const virtualKey = `virtual:${record.name}`;
      if (!keptByPath.has(virtualKey)) {
        keptByPath.set(virtualKey, record);
      }
      continue;
    }

    const key = toPosixPath(path.resolve(record.path));
    const existing = keptByPath.get(key);

    if (!existing) {
      keptByPath.set(key, record);
      continue;
    }

    duplicates.push({
      dropped: record,
      kept: existing,
    });
  }

  return {
    duplicates: duplicates.sort((a, b) => compareEntries(a.dropped, b.dropped)),
    records: Array.from(keptByPath.values()).sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)),
  };
}

function buildDiscoveredEntryName(args: {
  config: NormalizedDiscoverOptions;
  relativePath: string;
}): string {
  const ext = path.extname(args.relativePath);
  const withoutExt = ext ? args.relativePath.slice(0, -ext.length) : args.relativePath;
  return normalizePathValue([args.config.namePrefix, withoutExt].filter(Boolean).join("/"));
}

function createStableBundleId(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function resolveBundleGroup(entry: BundlerEntryRecord): NormalizedDiscoverBundleGroup | undefined {
  const ext = path.extname(entry.path).toLowerCase();
  return NORMALIZED_DISCOVERY_BUNDLE_GROUPS.find((group) => group.extensions.has(ext));
}

function toRootImportSpecifier(rootDir: string, absPath: string): string {
  const rel = normalizePathValue(path.relative(rootDir, absPath));
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function buildBundleContents(args: {
  files: BundlerEntryRecord[];
  loader: BundlerVirtualEntryLoader;
  rootDir: string;
}): string {
  if (args.loader === "css") {
    return args.files
      .map((file) => `@import ${JSON.stringify(toRootImportSpecifier(args.rootDir, file.path))};`)
      .join("\n");
  }

  return args.files
    .map((file) => `import ${JSON.stringify(toRootImportSpecifier(args.rootDir, file.path))};`)
    .join("\n");
}

function splitEntriesByMaxSize(args: {
  entries: Array<BundlerEntryRecord & { bytes: number }>;
  maxSize: number;
}): Array<Array<BundlerEntryRecord & { bytes: number }>> {
  const chunks: Array<Array<BundlerEntryRecord & { bytes: number }>> = [];
  let current: Array<BundlerEntryRecord & { bytes: number }> = [];
  let currentSize = 0;

  for (const entry of args.entries) {
    const nextSize = currentSize + entry.bytes;

    if (current.length > 0 && nextSize > args.maxSize) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }

    current.push(entry);
    currentSize += entry.bytes;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

async function toBundledDiscoverEntries(args: {
  config: NormalizedDiscoverOptions;
  records: BundlerEntryRecord[];
  rootDir: string;
}): Promise<BundlerEntryRecord[]> {
  const resolved = await Promise.all(args.records.map(async (record) => {
    const group = resolveBundleGroup(record);

    if (!group) {
      return {
        group: undefined,
        record,
      };
    }

    const stats = await fsp.stat(record.path);
    const bytes = Math.max(stats.size, 1);
    if (bytes > args.config.maxBundleSize) {
      throw new Error(`bundler-discover-bundle-file-too-large :: ${normalizePathValue(path.relative(args.rootDir, record.path))}`);
    }

    return {
      group,
      record: {
        ...record,
        bytes,
      },
    };
  }));

  const passthrough: BundlerEntryRecord[] = [];
  const grouped = new Map<string, {
    files: Array<BundlerEntryRecord & { bytes: number }>;
    group: NormalizedDiscoverBundleGroup;
  }>();

  for (const item of resolved) {
    if (!item.group) {
      passthrough.push(item.record);
      continue;
    }

    const existing = grouped.get(item.group.name);
    if (existing) {
      existing.files.push(item.record as BundlerEntryRecord & { bytes: number });
      continue;
    }

    grouped.set(item.group.name, {
      files: [item.record as BundlerEntryRecord & { bytes: number }],
      group: item.group,
    });
  }

  const bundledRecords: BundlerEntryRecord[] = [];

  for (const [groupName, value] of Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const bundleId = createStableBundleId(JSON.stringify({
      dir: args.config.dir,
      exclude: args.config.exclude,
      extensions: args.config.extensions,
      groupName,
      include: args.config.include,
      maxBundleSize: args.config.maxBundleSize,
      namePrefix: args.config.namePrefix,
    }));
    const chunks = splitEntriesByMaxSize({
      entries: value.files.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)),
      maxSize: args.config.maxBundleSize,
    });

    chunks.forEach((chunk, index) => {
      const suffix = chunks.length > 1 ? `-${index + 1}` : "";
      const name = `bundle-${bundleId}${suffix}`;

      bundledRecords.push({
        contents: buildBundleContents({
          files: chunk,
          loader: value.group.loader,
          rootDir: args.rootDir,
        }),
        name,
        path: `${VIRTUAL_ENTRY_PREFIX}${name}`,
        source: "virtual",
        virtualLoader: value.group.loader,
      });
    });
  }

  return [...passthrough, ...bundledRecords]
    .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

async function walkDiscoveredEntries(config: NormalizedDiscoverOptions): Promise<BundlerEntryRecord[]> {
  if (!fs.existsSync(config.dirAbs)) return [];

  const records: BundlerEntryRecord[] = [];

  const visit = async (currentAbs: string): Promise<void> => {
    const entries = await fsp.readdir(currentAbs, { withFileTypes: true });

    for (const entry of entries) {
      const abs = path.join(currentAbs, entry.name);
      const relFromDiscover = normalizePathValue(path.relative(config.dirAbs, abs));
      if (!relFromDiscover) continue;

      if (entry.isDirectory()) {
        if (config.ignoreDirs.has(entry.name)) continue;
        if (matchesAnyPattern(relFromDiscover, config.exclude)) continue;
        await visit(abs);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!config.extensions.includes(ext)) continue;
      if (config.include.length && !matchesAnyPattern(relFromDiscover, config.include)) continue;
      if (matchesAnyPattern(relFromDiscover, config.exclude)) continue;

      records.push({
        name: buildDiscoveredEntryName({
          config,
          relativePath: relFromDiscover,
        }),
        path: abs,
        source: "discover",
      });
    }
  };

  await visit(config.dirAbs);

  return records.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

async function resolveBundlerEntries(
  options: BundlerOptions,
  rootDir: string,
  settings: { allowEmpty?: boolean } = {},
): Promise<ResolvedEntries> {
  const manual = normalizeManualEntries(options.entries, rootDir);
  const virtual = normalizeVirtualEntries(options.virtualEntries);
  const discoveredGroups = await Promise.all(normalizeDiscoverOptions(rootDir, options.discover).map(async (config) => {
    const records = await walkDiscoveredEntries(config);
    return toBundledDiscoverEntries({
      config,
      records,
      rootDir,
    });
  }));
  const discovered = discoveredGroups.flat();
  const deduped = dedupeEntriesBySourcePath([...manual, ...virtual, ...discovered]);
  const all = deduped.records;

  if (!all.length && !settings.allowEmpty) {
    throw new Error("bundler-missing-entries");
  }

  const byName = new Map<string, BundlerEntryRecord>();

  for (const record of all) {
    const existing = byName.get(record.name);
    if (!existing) {
      byName.set(record.name, record);
      continue;
    }

    if (existing.path === record.path) continue;
    throw new Error(`bundler-entry-name-conflict :: ${record.name}`);
  }

  const records = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  const signature = JSON.stringify(records.map((record) => ({
    contents: record.source === "virtual" ? record.contents || "" : undefined,
    name: record.name,
    path: record.source === "virtual"
      ? `virtual:${record.name}`
      : normalizePathValue(path.relative(rootDir, record.path)),
    source: record.source,
  })));

  return {
    duplicates: deduped.duplicates,
    records,
    signature,
  };
}

function toEntryPointMap(records: BundlerEntryRecord[], rootDir: string): Record<string, string> {
  return Object.fromEntries(
    records.map((record) => [
      record.name,
      record.source === "virtual"
        ? record.path
        : normalizePathValue(path.relative(rootDir, record.path)),
    ]),
  );
}

function toPublicEntryMap(records: BundlerEntryRecord[], rootDir: string): Record<string, string> {
  return Object.fromEntries(
    records.map((record) => [
      record.name,
      record.source === "virtual"
        ? `virtual:${record.name}`
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
  toPublicEntryMap,
  toEntryPointMap,
  toPosixPath,
  VIRTUAL_ENTRY_PREFIX,
};
export type {
  DuplicateBundlerEntryRecord,
  NormalizedDiscoverOptions,
  NormalizedManifestOptions,
  ResolvedEntries,
};
