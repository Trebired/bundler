import type {
  BundlerRelatedClientEntryMapOptions,
} from "#3c8d8166992a";
import { collectRelatedFrontendEntries } from "#b144bhz25e6y";
import {
  collectAggregateMatchedSourcesByRuleKey,
  normalizeAggregateSourceId,
} from "./manifest.js";

async function buildRelatedClientEntryMap(
  options: BundlerRelatedClientEntryMapOptions,
): Promise<Record<string, string[]>> {
  const sources = resolveRelatedMapSources(options);
  const entries = await Promise.all(sources.map((source) => resolveRelatedEntriesForSource(options, source)));
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

function resolveRelatedMapSources(options: BundlerRelatedClientEntryMapOptions): string[] {
  if (options.aggregateSources?.length) return Array.from(new Set(options.aggregateSources)).sort();
  if (!options.manifest || !options.ruleKey) return [];
  return collectAggregateMatchedSourcesByRuleKey(options.manifest, options.ruleKey);
}

async function resolveRelatedEntriesForSource(
  options: BundlerRelatedClientEntryMapOptions,
  source: string,
): Promise<[string, string[]]> {
  const pageId = normalizeAggregateSourceId(source, options.pageId);
  const related = await collectRelatedFrontendEntries({
    rootDir: options.rootDir,
    sources: source,
    tsconfig: options.tsconfig,
  });
  return [pageId, related.entries];
}

export {
  buildRelatedClientEntryMap,
};
