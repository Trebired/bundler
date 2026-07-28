import fs from "node:fs/promises";
import path from "node:path";

import type {
  BundlerAggregateSourceIdOptions,
  BundlerAssetManifest,
  BundlerAssetManifestEntry,
  BundlerBuildResult,
  BundlerCollectAssetLinksLookup,
} from "#3c8d8166992a";
import { normalizePathValue } from "#tsnh4vdfql8p";

const DEFAULT_ROUTE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs", ".cts", ".cjs"];

function createEmptyAssetManifest(): BundlerAssetManifest {
  return {
    entries: {},
    entryOutputs: {},
    outputs: {},
    rules: {},
    sources: {},
  };
}

async function readBundlerManifest(filePath: string): Promise<Record<string, unknown>> {
  const body = await fs.readFile(path.resolve(filePath), "utf8");
  const parsed = JSON.parse(body) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error(`bundler-manifest-invalid :: ${filePath}`);
  return parsed as Record<string, unknown>;
}

function extractAssetManifest(value: BundlerAssetManifest | BundlerBuildResult | Record<string, unknown>): BundlerAssetManifest {
  const candidate = "assetManifest" in value ? value.assetManifest : value;
  if (!isAssetManifest(candidate)) throw new Error("bundler-asset-manifest-missing");
  return candidate;
}

function resolveAssetManifestEntryOutputPath(args: {
  entryId: string;
  from?: BundlerCollectAssetLinksLookup;
  manifest: BundlerAssetManifest | BundlerBuildResult | Record<string, unknown>;
  outDir: string;
}): string | undefined {
  const entry = resolveAssetManifestEntry(args.manifest, args.entryId, args.from || "auto");
  return entry ? path.resolve(args.outDir, entry.file) : undefined;
}

function resolveAggregateEntryByRuleKey(
  manifestValue: BundlerAssetManifest | BundlerBuildResult | Record<string, unknown>,
  ruleKey: string,
): BundlerAssetManifestEntry | undefined {
  const manifest = extractAssetManifest(manifestValue);
  const normalizedRuleKey = normalizePathValue(ruleKey);
  const rule = manifest.rules[normalizedRuleKey];
  const aggregateKey = rule?.entryKeys.find((entryKey) => manifest.entries[entryKey]?.aggregate);
  return aggregateKey ? manifest.entries[aggregateKey] : undefined;
}

function collectAggregateMatchedSourcesByRuleKey(
  manifestValue: BundlerAssetManifest | BundlerBuildResult | Record<string, unknown>,
  ruleKey: string,
): string[] {
  return resolveAggregateEntryByRuleKey(manifestValue, ruleKey)?.aggregate?.matchedSources.slice().sort() || [];
}

function normalizeAggregateSourceId(sourcePath: string, options: BundlerAggregateSourceIdOptions = {}): string {
  const prefix = normalizePathValue(options.sourcePrefix || "");
  const normalized = normalizePathValue(sourcePath);
  const withoutPrefix = prefix && normalized.startsWith(`${prefix}/`) ? normalized.slice(prefix.length + 1) : normalized;
  const withoutExtension = stripKnownExtension(withoutPrefix, options.extensions || DEFAULT_ROUTE_EXTENSIONS);
  const collapsed = options.collapseIndex !== false && withoutExtension.endsWith("/index")
    ? withoutExtension.slice(0, -"/index".length)
    : withoutExtension;
  return normalizePathValue(collapsed);
}

function createAggregateSourceIdMap(
  sources: readonly string[],
  options: BundlerAggregateSourceIdOptions = {},
): Record<string, string> {
  return Object.fromEntries(sources.map((source) => [source, normalizeAggregateSourceId(source, options)]));
}

function resolveAssetManifestEntry(
  manifestValue: BundlerAssetManifest | BundlerBuildResult | Record<string, unknown>,
  entryId: string,
  from: BundlerCollectAssetLinksLookup,
): BundlerAssetManifestEntry | undefined {
  const manifest = extractAssetManifest(manifestValue);
  const key = resolveEntryKey(manifest, normalizePathValue(entryId), from);
  return key ? manifest.entries[key] : undefined;
}

function resolveEntryKey(
  manifest: BundlerAssetManifest,
  entryId: string,
  from: BundlerCollectAssetLinksLookup,
): string | undefined {
  if (from === "entryKey") return manifest.entries[entryId] ? entryId : undefined;
  if (from === "source") return manifest.sources[entryId]?.entryKey;
  if (from === "entryOutput") return manifest.entryOutputs[entryId];
  if (from === "ruleKey") return manifest.rules[entryId]?.entryKeys[0];
  return manifest.entries[entryId] ? entryId : manifest.sources[entryId]?.entryKey || manifest.entryOutputs[entryId] || manifest.rules[entryId]?.entryKeys[0];
}

function stripKnownExtension(sourcePath: string, extensions: readonly string[]): string {
  const sorted = [...extensions].map((item) => item.startsWith(".") ? item : `.${item}`).sort((a, b) => b.length - a.length);
  const extension = sorted.find((item) => sourcePath.endsWith(item));
  return extension ? sourcePath.slice(0, -extension.length) : sourcePath;
}

function isAssetManifest(value: unknown): value is BundlerAssetManifest {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Boolean(record.entries && record.entryOutputs && record.outputs && record.rules && record.sources);
}

export {
  collectAggregateMatchedSourcesByRuleKey,
  createAggregateSourceIdMap,
  createEmptyAssetManifest,
  extractAssetManifest,
  normalizeAggregateSourceId,
  readBundlerManifest,
  resolveAggregateEntryByRuleKey,
  resolveAssetManifestEntryOutputPath,
};
