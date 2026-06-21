import type { Metafile } from "esbuild";

import type {
  BundlerAggregateEntryMetadata,
  BundlerAggregateRuleMetadata,
  BundlerDiscoverRuleStrategy,
  BundlerEntryKind,
  BundlerResolvedDiscovery,
} from "./discovery.js";

type BundlerManifestOptions = boolean | {
  file?: string;
};

type BundlerDerivedManifestEntry = {
  entryOutput: string;
  entryName?: string;
  inputs: string[];
  js: string[];
  css: string[];
  imports: string[];
};

type BundlerDerivedManifestChunk = {
  output: string;
  inputs: string[];
  css: string[];
  imports: string[];
};

type BundlerDerivedManifestOutputKind = "asset" | "chunk" | "entry";

type BundlerDerivedManifestOutput = {
  output: string;
  kind: BundlerDerivedManifestOutputKind;
  entryPoint?: string;
  entryName?: string;
  inputs: string[];
  css: string[];
  imports: string[];
  bytes: number;
};

type BundlerDerivedManifest = {
  entries: Record<string, BundlerDerivedManifestEntry>;
  chunks: Record<string, BundlerDerivedManifestChunk>;
  allOutputs: Record<string, BundlerDerivedManifestOutput>;
};

type BundlerAssetManifestEntry = {
  aggregate?: BundlerAggregateEntryMetadata;
  assets: string[];
  css: string[];
  entryOutput: string;
  entrySource?: string;
  file: string;
  generated: boolean;
  imports: string[];
  js: string[];
  key: string;
  kind: BundlerEntryKind;
  outputs: string[];
  ruleKey: string;
  sources: string[];
  strategy: Exclude<BundlerDiscoverRuleStrategy, "ignore">;
};

type BundlerAssetManifestSource = {
  entryKey: string;
  outputs: string[];
  ruleKey: string;
  source: string;
  strategy: Exclude<BundlerDiscoverRuleStrategy, "ignore">;
};

type BundlerAssetManifestRule = {
  aggregate?: BundlerAggregateRuleMetadata;
  entryKeys: string[];
  ignoredSources: string[];
  ruleKey: string;
  strategy: BundlerDiscoverRuleStrategy;
};

type BundlerAssetManifestOutput = {
  bytes: number;
  css: string[];
  entryKey?: string;
  entryPoint?: string;
  imports: string[];
  inputs: string[];
  kind: BundlerDerivedManifestOutputKind;
  output: string;
  ruleKey?: string;
  strategy?: Exclude<BundlerDiscoverRuleStrategy, "ignore">;
};

type BundlerAssetManifest = {
  entries: Record<string, BundlerAssetManifestEntry>;
  entryOutputs: Record<string, string>;
  outputs: Record<string, BundlerAssetManifestOutput>;
  rules: Record<string, BundlerAssetManifestRule>;
  sources: Record<string, BundlerAssetManifestSource>;
};

type BundlerBuildAssetManifestOptions = {
  metafile: Metafile;
  resolvedDiscovery?: BundlerResolvedDiscovery;
  rootDir: string;
  outDir: string;
};

type BundlerCollectAssetLinksLookup = "auto" | "entryKey" | "entryOutput" | "ruleKey" | "source";

type BundlerCollectAssetLinksOptions = {
  from?: BundlerCollectAssetLinksLookup;
  publicPath?: string;
};

type BundlerCollectedAssetLinks = {
  entryKeys: string[];
  scripts: string[];
  styles: string[];
  assets: string[];
  outputs: string[];
  missing: string[];
};

export type {
  BundlerAssetManifest,
  BundlerAssetManifestEntry,
  BundlerAssetManifestOutput,
  BundlerAssetManifestRule,
  BundlerAssetManifestSource,
  BundlerBuildAssetManifestOptions,
  BundlerCollectedAssetLinks,
  BundlerCollectAssetLinksLookup,
  BundlerCollectAssetLinksOptions,
  BundlerDerivedManifest,
  BundlerDerivedManifestChunk,
  BundlerDerivedManifestEntry,
  BundlerDerivedManifestOutput,
  BundlerDerivedManifestOutputKind,
  BundlerManifestOptions,
};
