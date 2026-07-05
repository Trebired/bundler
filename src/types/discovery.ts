type BundlerVirtualEntryLoader = "css" | "ts";
type BundlerDiscoverRuleStrategy = "entry" | "bundle" | "ignore" | "aggregate";
type BundlerEntryKind = "entry" | "bundle";
type BundlerEntrySource = "discover" | "internal";
type BundlerAggregateKind = "module-map";

type BundlerAggregateModuleMapExports = {
  root?: string;
  map: string;
  resolver: string;
  default?: boolean;
};

type BundlerAggregateModuleMap = {
  kind: "module-map";
  rootModule?: string;
  rootModuleExportName?: string;
  matchedModuleExportName?: string;
  keyFromPath?: "relative-path";
  collapseIndex?: boolean;
  allowEmpty?: boolean;
  exports?: BundlerAggregateModuleMapExports;
};

type BundlerDiscoverEntryRule = {
  key: string;
  include: string[];
  exclude?: string[];
  strategy: "entry";
};

type BundlerDiscoverBundleRule = {
  key: string;
  include: string[];
  exclude?: string[];
  strategy: "bundle";
  maxBundleSize?: number | string;
};

type BundlerDiscoverIgnoreRule = {
  key: string;
  include: string[];
  exclude?: string[];
  strategy: "ignore";
};

type BundlerDiscoverAggregateRule = {
  key: string;
  include: string[];
  exclude?: string[];
  strategy: "aggregate";
  aggregate: BundlerAggregateModuleMap;
};

type BundlerDiscoverRule =
  | BundlerDiscoverEntryRule
  | BundlerDiscoverBundleRule
  | BundlerDiscoverIgnoreRule
  | BundlerDiscoverAggregateRule;

type BundlerDiscoverOptions = {
  dir: string;
  rules: BundlerDiscoverRule[];
  ignoreDirs?: string[];
};

type BundlerAggregateEntryMetadata = {
  kind: "module-map";
  rootModule?: string;
  matchedSources: string[];
};

type BundlerAggregateRuleMetadata = {
  kind: "module-map";
  rootModule?: string;
};

type BundlerEntryRecord = {
  aggregate?: BundlerAggregateEntryMetadata;
  contents?: string;
  entrySource?: string;
  generated: boolean;
  key: string;
  kind: BundlerEntryKind;
  name: string;
  ownedSources: string[];
  path: string;
  ruleKey: string;
  source: BundlerEntrySource;
  strategy: Exclude<BundlerDiscoverRuleStrategy, "ignore">;
  virtualLoader?: BundlerVirtualEntryLoader;
};

type BundlerResolvedRule = {
  aggregate?: BundlerAggregateRuleMetadata;
  entryKeys: string[];
  ignoredSources: string[];
  ruleKey: string;
  strategy: BundlerDiscoverRuleStrategy;
};

type BundlerResolvedDiscovery = {
  entries: BundlerEntryRecord[];
  rules: Record<string, BundlerResolvedRule>;
  sourceOwners: Record<string, string>;
};

export type {
  BundlerAggregateEntryMetadata,
  BundlerAggregateKind,
  BundlerAggregateModuleMap,
  BundlerAggregateModuleMapExports,
  BundlerAggregateRuleMetadata,
  BundlerDiscoverAggregateRule,
  BundlerDiscoverBundleRule,
  BundlerDiscoverEntryRule,
  BundlerDiscoverIgnoreRule,
  BundlerDiscoverOptions,
  BundlerDiscoverRule,
  BundlerDiscoverRuleStrategy,
  BundlerEntryKind,
  BundlerEntryRecord,
  BundlerEntrySource,
  BundlerResolvedDiscovery,
  BundlerResolvedRule,
  BundlerVirtualEntryLoader,
};
