import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import type {
  BundlerEntryRecord,
  BundlerResolvedRule,
} from "#jb343639kom2";
import { walkImportGraph } from "#68011e944d8d";
import {
  matchesAnyPattern,
  normalizePathValue,
  resolveBundleLoader,
} from "./shared.js";
import type {
  DiscoveredFile,
  NormalizedBundleRule,
  NormalizedDiscoverOptions,
  NormalizedDiscoverRule,
} from "./shared.js";

async function scanDiscoveredFiles(config: NormalizedDiscoverOptions, rootDir: string): Promise<DiscoveredFile[]> {
  if (!fs.existsSync(config.dirAbs)) return [];
  const files: DiscoveredFile[] = [];
  await visitDirectory(config.dirAbs, config, rootDir, files);
  return files.sort((a, b) => a.rootRel.localeCompare(b.rootRel));
}

function classifyFile(args: {
  config: NormalizedDiscoverOptions;
  file: DiscoveredFile;
}): NormalizedDiscoverRule | undefined {
  return args.config.rules.find((rule) => matchesRule(rule, args.file.discoverRel));
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

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function assignSourceOwner(args: {
  entryKey: string;
  sourceOwners: Map<string, string>;
  sourcePath: string;
}): void {
  const existing = args.sourceOwners.get(args.sourcePath);
  if (existing && existing !== args.entryKey) throw new Error(`bundler-discover-source-owner-conflict :: ${args.sourcePath}`);
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
    const graph = await walkImportGraph({ entries: bootEntry.entrySource, rootDir: args.rootDir });
    const groupedDependency = Object.keys(graph.files)
      .sort()
      .find((sourcePath) => sourcePath !== bootEntry.entrySource && groupedScriptSources.has(sourcePath));
    if (groupedDependency) {
      throw new Error(`bundler-discover-entry-imports-grouped-source :: ${bootEntry.entrySource} -> ${groupedDependency}`);
    }
  }
}

async function readBundleFilesWithStats(
  matchedFiles: DiscoveredFile[],
  rule: NormalizedBundleRule,
): Promise<Array<DiscoveredFile & { bytes: number }>> {
  const filesWithStats = await Promise.all(matchedFiles.map(async (file) => {
    const stats = await fsp.stat(file.absPath);
    const bytes = Math.max(stats.size, 1);
    if (bytes > rule.maxBundleSize) throw new Error(`bundler-discover-bundle-file-too-large :: ${file.rootRel}`);
    return { ...file, bytes };
  }));

  const loaders = new Set(filesWithStats.map((file) => resolveBundleLoader(file.rootRel)).filter(Boolean));
  if (filesWithStats.length > 0 && loaders.size !== 1) {
    throw new Error(`bundler-discover-rule-mixed-loaders :: ${rule.key}`);
  }

  return filesWithStats;
}

async function visitDirectory(
  currentAbs: string,
  config: NormalizedDiscoverOptions,
  rootDir: string,
  files: DiscoveredFile[],
): Promise<void> {
  const entries = await fsp.readdir(currentAbs, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(currentAbs, entry.name);
    const discoverRel = normalizePathValue(path.relative(config.dirAbs, abs));
    if (!discoverRel) continue;
    if (entry.isDirectory()) {
      if (config.ignoreDirs.has(entry.name)) continue;
      await visitDirectory(abs, config, rootDir, files);
      continue;
    }
    if (!entry.isFile()) continue;
    files.push({
      absPath: abs,
      discoverRel,
      rootRel: normalizePathValue(path.relative(rootDir, abs)),
    });
  }
}

function matchesRule(rule: NormalizedDiscoverRule, discoverRel: string): boolean {
  if (!matchesAnyPattern(discoverRel, rule.include)) return false;
  if (matchesAnyPattern(discoverRel, rule.exclude)) return false;
  return true;
}

export {
  assignSourceOwner,
  classifyFile,
  readBundleFilesWithStats,
  scanDiscoveredFiles,
  splitByMaxSize,
  validateGroupedBootImports,
};
