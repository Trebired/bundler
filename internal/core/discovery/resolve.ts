import path from "node:path";

import type {
  BundlerEntryRecord,
  BundlerOptions,
  BundlerResolvedRule,
} from "#jb343639kom2";
import {
  buildAggregateModuleMapContents,
  createAggregateEntryMetadata,
  createAggregateRuleMetadata,
  resolveAggregateRootModule,
  validateAggregatePathKeys,
} from "./aggregate.js";
import {
  buildBundleContents,
  createResolvedDiscovery,
  emitEntryRecord,
} from "./emit.js";
import { normalizeDiscoverOptions, normalizeManifestOptions } from "./normalize.js";
import { normalizeDiscoverRoots, toEntryPointMap } from "./public.js";
import {
  classifyFile,
  readBundleFilesWithStats,
  scanDiscoveredFiles,
  splitByMaxSize,
  validateGroupedBootImports,
} from "./scan.js";
import {
  buildAggregateEntryKey,
  buildBundleEntryKey,
  buildEntryKey,
  createStableId,
  normalizePathValue,
  resolveAggregateModuleLoader,
  resolveBundleLoader,
  VIRTUAL_ENTRY_PREFIX,
} from "./shared.js";
import type {
  DiscoveredFile,
  NormalizedAggregateRule,
  NormalizedBundleRule,
  NormalizedDiscoverOptions,
  NormalizedManifestOptions,
  ResolvedAggregateRootModule,
  ResolvedDiscovery,
} from "./shared.js";

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
    await resolveConfigEntries({
      config,
      emittedKeys,
      emittedNames,
      resolvedEntries,
      rootDir,
      rules,
      sourceOwners,
    });
  }

  await validateGroupedBootImports({ entries: resolvedEntries, rootDir });
  if (resolvedEntries.length === 0 && !settings.allowEmpty) throw new Error("bundler-missing-entries");

  const discovery = createResolvedDiscovery({ resolvedEntries, rules, sourceOwners });
  return {
    ...discovery,
    signature: JSON.stringify({
      entries: discovery.entries.map((entry) => ({
        aggregate: entry.aggregate,
        entrySource: entry.entrySource,
        generated: entry.generated,
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

async function resolveConfigEntries(args: {
  config: NormalizedDiscoverOptions;
  emittedKeys: Set<string>;
  emittedNames: Set<string>;
  resolvedEntries: BundlerEntryRecord[];
  rootDir: string;
  rules: Map<string, BundlerResolvedRule>;
  sourceOwners: Map<string, string>;
}): Promise<void> {
  const files = await scanDiscoveredFiles(args.config, args.rootDir);
  const matchedByRule = new Map<string, DiscoveredFile[]>();
  const aggregateRootModules = initializeRules(args.config, args.rootDir, args.rules, matchedByRule);
  const reservedAggregateRoots = new Set(Array.from(aggregateRootModules.values())
    .filter((item) => item.rootRel.startsWith(`${args.config.dir}/`) || item.rootRel === args.config.dir)
    .map((item) => item.rootRel));

  matchFilesToRules(files, args.config, matchedByRule, reservedAggregateRoots);
  for (const rule of args.config.rules) {
    const matchedFiles = (matchedByRule.get(rule.key) || []).sort((a, b) => a.rootRel.localeCompare(b.rootRel));
    const ruleRecord = args.rules.get(rule.key)!;
    await resolveRuleEntries({
      aggregateRootModules,
      config: args.config,
      emittedKeys: args.emittedKeys,
      emittedNames: args.emittedNames,
      matchedFiles,
      resolvedEntries: args.resolvedEntries,
      rootDir: args.rootDir,
      rule,
      ruleRecord,
      sourceOwners: args.sourceOwners,
    });
  }
}

function initializeRules(
  config: NormalizedDiscoverOptions,
  rootDir: string,
  rules: Map<string, BundlerResolvedRule>,
  matchedByRule: Map<string, DiscoveredFile[]>,
): Map<string, ResolvedAggregateRootModule> {
  const aggregateRootModules = new Map<string, ResolvedAggregateRootModule>();

  for (const rule of config.rules) {
    const ruleRecord: BundlerResolvedRule = {
      entryKeys: [],
      ignoredSources: [],
      ruleKey: rule.key,
      strategy: rule.strategy,
    };
    if (rule.strategy === "aggregate") {
      const rootModule = resolveAggregateRootModule({ config, rootDir, rule });
      if (rootModule) aggregateRootModules.set(rule.key, rootModule);
      ruleRecord.aggregate = createAggregateRuleMetadata(rootModule);
    }
    rules.set(rule.key, ruleRecord);
    matchedByRule.set(rule.key, []);
  }

  return aggregateRootModules;
}

function matchFilesToRules(
  files: DiscoveredFile[],
  config: NormalizedDiscoverOptions,
  matchedByRule: Map<string, DiscoveredFile[]>,
  reservedAggregateRoots: Set<string>,
): void {
  for (const file of files) {
    const matchedRule = classifyFile({ config, file });
    if (!matchedRule) {
      if (reservedAggregateRoots.has(file.rootRel)) continue;
      throw new Error(`bundler-discover-unmatched-file :: ${file.rootRel}`);
    }
    matchedByRule.get(matchedRule.key)!.push(file);
  }
}

async function resolveRuleEntries(args: {
  aggregateRootModules: Map<string, ResolvedAggregateRootModule>;
  config: NormalizedDiscoverOptions;
  emittedKeys: Set<string>;
  emittedNames: Set<string>;
  matchedFiles: DiscoveredFile[];
  resolvedEntries: BundlerEntryRecord[];
  rootDir: string;
  rule: NormalizedDiscoverOptions["rules"][number];
  ruleRecord: BundlerResolvedRule;
  sourceOwners: Map<string, string>;
}): Promise<void> {
  if (args.rule.strategy === "ignore") {
    args.ruleRecord.ignoredSources = args.matchedFiles.map((file) => file.rootRel);
    return;
  }

  if (args.rule.strategy === "entry") {
    resolveDirectEntryRecords(args);
    return;
  }

  if (args.rule.strategy === "bundle") {
    await resolveBundleEntryRecords({ ...args, rule: args.rule as NormalizedBundleRule });
    return;
  }

  resolveAggregateEntryRecord(
    { ...args, rule: args.rule as NormalizedAggregateRule },
    args.aggregateRootModules.get(args.rule.key),
  );
}

function resolveDirectEntryRecords(args: Parameters<typeof resolveRuleEntries>[0]): void {
  for (const file of args.matchedFiles) {
    const ext = path.extname(file.rootRel);
    const withoutExt = ext ? file.rootRel.slice(0, -ext.length) : file.rootRel;
    const record: BundlerEntryRecord = {
      entrySource: file.rootRel,
      generated: false,
      key: buildEntryKey({ rootRel: file.rootRel, ruleKey: args.rule.key }),
      kind: "entry",
      name: normalizePathValue(withoutExt),
      ownedSources: [file.rootRel],
      path: file.absPath,
      ruleKey: args.rule.key,
      source: "discover",
      strategy: "entry",
    };
    emitEntryRecord({
      emittedKeys: args.emittedKeys,
      emittedNames: args.emittedNames,
      record,
      resolvedEntries: args.resolvedEntries,
      ruleRecord: args.ruleRecord,
      sourceOwners: args.sourceOwners,
    });
  }
}

async function resolveBundleEntryRecords(
  args: Parameters<typeof resolveRuleEntries>[0] & { rule: NormalizedBundleRule },
): Promise<void> {
  const filesWithStats = await readBundleFilesWithStats(args.matchedFiles, args.rule);
  if (filesWithStats.length === 0) return;
  const stableId = createStableId(JSON.stringify({
    dir: args.config.dir,
    ruleKey: args.rule.key,
    sources: filesWithStats.map((file) => file.rootRel),
  }));
  const chunks = splitByMaxSize({
    files: filesWithStats.sort((a, b) => a.rootRel.localeCompare(b.rootRel)),
    maxBundleSize: args.rule.maxBundleSize,
  });
  const loader = resolveBundleLoader(filesWithStats[0].rootRel)!;

  chunks.forEach((chunk, index) => {
    const part = index + 1;
    const name = chunks.length === 1 ? `bundle-${stableId}` : `bundle-${stableId}-${part}`;
    const key = buildBundleEntryKey(args.rule.key, part);
    const ownedSources = chunk.map((file) => file.rootRel);
    emitEntryRecord({
      emittedKeys: args.emittedKeys,
      emittedNames: args.emittedNames,
      record: {
        contents: buildBundleContents({ files: chunk, loader, rootDir: args.rootDir }),
        generated: true,
        key,
        kind: "bundle",
        name,
        ownedSources,
        path: `${VIRTUAL_ENTRY_PREFIX}${name}`,
        ruleKey: args.rule.key,
        source: "internal",
        strategy: "bundle",
        virtualLoader: loader,
      },
      resolvedEntries: args.resolvedEntries,
      ruleRecord: args.ruleRecord,
      sourceOwners: args.sourceOwners,
    });
  });
}

function resolveAggregateEntryRecord(
  args: Parameters<typeof resolveRuleEntries>[0] & { rule: NormalizedAggregateRule },
  rootModule?: ResolvedAggregateRootModule,
): void {
  const unsupportedFile = args.matchedFiles.find((file) => !resolveAggregateModuleLoader(file.rootRel));
  if (unsupportedFile) throw new Error(`bundler-discover-aggregate-unsupported-file :: ${args.rule.key} :: ${unsupportedFile.rootRel}`);
  validateAggregatePathKeys({ collapseIndex: args.rule.aggregate.collapseIndex, matchedFiles: args.matchedFiles, rule: args.rule });
  if (args.matchedFiles.length === 0 && !args.rule.aggregate.allowEmpty) {
    throw new Error(`bundler-discover-aggregate-empty :: ${args.rule.key}`);
  }

  const aggregateMetadata = createAggregateEntryMetadata({ matchedFiles: args.matchedFiles, rootModule });
  const stableId = createStableId(JSON.stringify({
    aggregate: args.rule.aggregate,
    dir: args.config.dir,
    rootModule: rootModule?.rootRel,
    ruleKey: args.rule.key,
    sources: aggregateMetadata.matchedSources,
  }));
  const name = `aggregate-${stableId}`;
  const ownedSources = [...aggregateMetadata.matchedSources, ...(rootModule ? [rootModule.rootRel] : [])].sort();

  emitEntryRecord({
    emittedKeys: args.emittedKeys,
    emittedNames: args.emittedNames,
    record: {
      aggregate: aggregateMetadata,
      contents: buildAggregateModuleMapContents({
        aggregate: args.rule.aggregate,
        includePatterns: args.rule.include,
        matchedFiles: args.matchedFiles,
        rootDir: args.rootDir,
        rootModule,
      }),
      generated: true,
      key: buildAggregateEntryKey(args.rule.key),
      kind: "entry",
      name,
      ownedSources,
      path: `${VIRTUAL_ENTRY_PREFIX}${name}`,
      ruleKey: args.rule.key,
      source: "internal",
      strategy: "aggregate",
      virtualLoader: "ts",
    },
    resolvedEntries: args.resolvedEntries,
    ruleRecord: args.ruleRecord,
    sourceOwners: args.sourceOwners,
  });
}

export {
  normalizeDiscoverRoots,
  normalizeManifestOptions,
  resolveBundlerEntries,
  toEntryPointMap,
};
