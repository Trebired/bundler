import path from "node:path";

import type {
  BundlerRelatedClientEntryMapOptions,
} from "#3c8d8166992a";
import { normalizePathValue } from "#5kd9snhn6zft";
import { collectRelatedFrontendEntryMap } from "#b144bhz25e6y";
import {
  collectAggregateMatchedSourcesByRuleKey,
  normalizeAggregateSourceId,
} from "./manifest.js";

async function buildRelatedClientEntryMap(
  options: BundlerRelatedClientEntryMapOptions,
): Promise<Record<string, string[]>> {
  const sources = resolveRelatedMapSources(options);
  const relatedEntryMap = await collectRelatedFrontendEntryMap({
      rootDir: options.rootDir,
      sources,
      tsconfig: options.tsconfig,
  });
  const entries = sources.map((source) => resolveRelatedEntriesForSource(options, source, relatedEntryMap));
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

function resolveRelatedMapSources(options: BundlerRelatedClientEntryMapOptions): string[] {
  if (options.aggregateSources?.length) return Array.from(new Set(options.aggregateSources)).sort();
  if (!options.manifest || !options.ruleKey) return [];
  return collectAggregateMatchedSourcesByRuleKey(options.manifest, options.ruleKey);
}

function resolveRelatedEntriesForSource(
  options: BundlerRelatedClientEntryMapOptions,
  source: string,
  relatedEntryMap: Record<string, string[]>,
): [string, string[]] {
  const pageId = normalizeAggregateSourceId(source, options.pageId);
  return [pageId, relatedEntryMap[resolveRelatedMapSourceKey(options.rootDir, source)] || []];
}

function resolveRelatedMapSourceKey(rootDir: string | undefined, source: string): string {
  const root = path.resolve(String(rootDir || "").trim() || process.cwd());
  const normalized = String(source || "").trim();
  if (!normalized) return "";
  const sourceAbs = path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(root, normalized);
  return normalizePathValue(path.relative(root, sourceAbs));
}

export {
  buildRelatedClientEntryMap,
};
