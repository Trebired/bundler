import fs from "node:fs";
import path from "node:path";

import type {
  BundlerImportGraph,
  BundlerRelatedEntriesOptions,
  BundlerRelatedEntriesResult,
  BundlerRelatedEntryMatch,
} from "#3c8d8166992a";
import { walkImportGraph } from "./import_graph/resolve.js";
import { normalizePathValue } from "./discovery/shared.js";

async function collectRelatedEntries(options: BundlerRelatedEntriesOptions): Promise<BundlerRelatedEntriesResult> {
  const rootDir = path.resolve(String(options.rootDir || "").trim() || process.cwd());
  const graph = await walkImportGraph({
      entries: options.sources,
      extensions: options.extensions,
      rootDir,
      tsconfig: options.tsconfig,
  });
  const patterns = normalizeCandidatePatterns(options);
  const matches = collectCandidateMatches(Object.keys(graph.files), patterns, rootDir);

  return {
    entries: Array.from(new Set(matches.map((item) => item.entry))).sort(),
    graph,
    matches,
  };
}

async function collectRelatedEntryMap(options: BundlerRelatedEntriesOptions): Promise<Record<string, string[]>> {
  const rootDir = path.resolve(String(options.rootDir || "").trim() || process.cwd());
  const graph = await walkImportGraph({
      entries: options.sources,
      extensions: options.extensions,
      rootDir,
      tsconfig: options.tsconfig,
  });
  const patterns = normalizeCandidatePatterns(options);
  const candidateCache = new Map<string, string[]>();
  const entries = graph.entries.map((source) => [
      source,
      collectRelatedEntriesForSource(graph, source, patterns, rootDir, candidateCache),
    ] as const);

  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

function collectRelatedEntriesForSource(
  graph: BundlerImportGraph,
  source: string,
  patterns: string[],
  rootDir: string,
  candidateCache: Map<string, string[]>,
): string[] {
  const related = new Set<string>();
  for (const graphPath of collectReachableGraphPaths(graph, source)) {
    for (const entry of resolveCandidateEntries(graphPath, patterns, rootDir, candidateCache)) related.add(entry);
  }
  return Array.from(related).sort();
}

function collectReachableGraphPaths(graph: BundlerImportGraph, source: string): string[] {
  const seen = new Set<string>();
  const pending = [source];

  while (pending.length) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);

    const file = graph.files[current];
    if (!file) continue;
    for (const item of file.imports) {
      if (item.resolved && !seen.has(item.resolved)) pending.push(item.resolved);
    }
  }

  return Array.from(seen).sort();
}

function resolveCandidateEntries(
  source: string,
  patterns: string[],
  rootDir: string,
  candidateCache: Map<string, string[]>,
): string[] {
  const cached = candidateCache.get(source);
  if (cached) return cached;
  const entries = collectCandidateMatches([source], patterns, rootDir).map((item) => item.entry);
  candidateCache.set(source, entries);
  return entries;
}

function normalizeCandidatePatterns(options: BundlerRelatedEntriesOptions): string[] {
  const explicit = (options.candidatePatterns || []).map(normalizePathValue).filter(Boolean);
  const suffixPatterns = createSuffixCandidatePatterns(options);
  return Array.from(new Set([...explicit, ...suffixPatterns]));
}

function createSuffixCandidatePatterns(options: BundlerRelatedEntriesOptions): string[] {
  const suffixes = (options.candidateSuffixes || []).map(String).map((item) => item.trim()).filter(Boolean);
  const extensions = (options.candidateExtensions || []).map(normalizeExtension).filter(Boolean);
  if (suffixes.length === 0 || extensions.length === 0) return [];

  return suffixes.flatMap((suffix) => extensions.map((extension) => `[path]${suffix}${extension}`));
}

function collectCandidateMatches(
  sources: string[],
  patterns: string[],
  rootDir: string,
): BundlerRelatedEntryMatch[] {
  const seen = new Set<string>();
  const matches: BundlerRelatedEntryMatch[] = [];

  for (const source of sources.sort()) {
    for (const patternValue of patterns) {
      const entry = resolveCandidatePath(source, patternValue, rootDir);
      const key = `${source}\0${entry}`;
      if (!entry || seen.has(key)) continue;
      seen.add(key);
      matches.push({ entry, pattern: patternValue, source });
    }
  }
  return matches.sort((a, b) => a.entry.localeCompare(b.entry) || a.source.localeCompare(b.source));
}

function resolveCandidatePath(source: string, patternValue: string, rootDir: string): string {
  const candidate = applyCandidatePattern(source, patternValue);
  if (!candidate) return "";
  const candidateAbs = path.resolve(rootDir, candidate);
  if (!fs.existsSync(candidateAbs) || !fs.statSync(candidateAbs).isFile()) return "";
  return normalizePathValue(path.relative(rootDir, candidateAbs));
}

function applyCandidatePattern(source: string, patternValue: string): string {
  const normalizedSource = normalizePathValue(source);
  const ext = path.posix.extname(normalizedSource);
  const sourcePath = ext ? normalizedSource.slice(0, -ext.length) : normalizedSource;
  const dir = path.posix.dirname(normalizedSource);
  const normalizedDir = dir === "." ? "" : dir;
  const name = path.posix.basename(sourcePath);

  return normalizePathValue(patternValue
    .replace(/\[source\]/gu, normalizedSource)
    .replace(/\[path\]/gu, sourcePath)
    .replace(/\[dir\]/gu, normalizedDir)
    .replace(/\[name\]/gu, name)
    .replace(/\[ext\]/gu, ext));
}

function normalizeExtension(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

export { collectRelatedEntries };
export { collectRelatedEntryMap };
