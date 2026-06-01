import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import type {
  BundlerDiscoverOptions,
  BundlerEntryRecord,
  BundlerManifestOptions,
  BundlerOptions,
  BundlerVirtualEntries,
} from "../types.js";

const DEFAULT_DISCOVERY_EXTENSIONS = [".css", ".js", ".jsx", ".scss", ".ts", ".tsx"];
const DEFAULT_IGNORE_DIRS = [".git", "coverage", "dist", "node_modules"];
const VIRTUAL_ENTRY_PREFIX = "trebired-virtual:";

type NormalizedDiscoverOptions = {
  dir: string;
  dirAbs: string;
  exclude: string[];
  extensions: string[];
  ignoreDirs: Set<string>;
  include: string[];
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
  const discoveredGroups = await Promise.all(normalizeDiscoverOptions(rootDir, options.discover).map(walkDiscoveredEntries));
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
