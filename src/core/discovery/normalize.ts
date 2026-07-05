import path from "node:path";

import type {
  BundlerAggregateModuleMap,
  BundlerDiscoverRule,
  BundlerOptions,
} from "#jb343639kom2";
import {
  DEFAULT_AGGREGATE_EXPORT_DEFAULT,
  DEFAULT_AGGREGATE_KEY_FROM_PATH,
  DEFAULT_AGGREGATE_MAP_EXPORT,
  DEFAULT_AGGREGATE_MATCHED_EXPORT_NAME,
  DEFAULT_AGGREGATE_RESOLVER_EXPORT,
  DEFAULT_AGGREGATE_ROOT_BINDING_EXPORT,
  DEFAULT_AGGREGATE_ROOT_EXPORT_NAME,
  DEFAULT_IGNORE_DIRS,
  isValidIdentifier,
  normalizePathValue,
  normalizeStringList,
  parseBundleMaxSize,
} from "./shared.js";
import type {
  NormalizedAggregateModuleMap,
  NormalizedDiscoverOptions,
  NormalizedDiscoverRule,
} from "./shared.js";

function normalizeAggregateModuleMap(
  aggregate: BundlerAggregateModuleMap | undefined,
  ruleKey: string,
): NormalizedAggregateModuleMap {
  if (!aggregate) throw new Error(`bundler-discover-aggregate-missing-config :: ${ruleKey}`);
  if (aggregate.kind !== "module-map") throw new Error(`bundler-discover-aggregate-unsupported-kind :: ${ruleKey}`);
  const keyFromPath = aggregate.keyFromPath || DEFAULT_AGGREGATE_KEY_FROM_PATH;
  if (keyFromPath !== "relative-path") throw new Error(`bundler-discover-aggregate-invalid-key-from-path :: ${ruleKey}`);

  const rootModule = aggregate.rootModule ? normalizePathValue(aggregate.rootModule) : undefined;
  const rootModuleExportName = String(aggregate.rootModuleExportName || DEFAULT_AGGREGATE_ROOT_EXPORT_NAME).trim();
  const matchedModuleExportName = String(aggregate.matchedModuleExportName || DEFAULT_AGGREGATE_MATCHED_EXPORT_NAME).trim();
  const mapExport = String(aggregate.exports?.map || DEFAULT_AGGREGATE_MAP_EXPORT).trim();
  const resolverExport = String(aggregate.exports?.resolver || DEFAULT_AGGREGATE_RESOLVER_EXPORT).trim();
  const rootExport = aggregate.exports?.root ? String(aggregate.exports.root).trim() : DEFAULT_AGGREGATE_ROOT_BINDING_EXPORT;

  validateAggregateExports(ruleKey, [["map", mapExport], ["resolver", resolverExport], ["root", rootExport]]);
  if (new Set([mapExport, resolverExport, rootExport]).size !== 3) {
    throw new Error(`bundler-discover-aggregate-duplicate-export-name :: ${ruleKey}`);
  }

  return {
    allowEmpty: Boolean(aggregate.allowEmpty),
    collapseIndex: Boolean(aggregate.collapseIndex),
    exports: {
      default: aggregate.exports?.default ?? DEFAULT_AGGREGATE_EXPORT_DEFAULT,
      map: mapExport,
      resolver: resolverExport,
      root: rootModule ? rootExport : undefined,
    },
    keyFromPath,
    kind: "module-map",
    matchedModuleExportName,
    rootModule,
    rootModuleExportName,
  };
}

function normalizeDiscoverRule(rule: BundlerDiscoverRule): NormalizedDiscoverRule {
  const key = normalizePathValue(rule.key);
  const include = normalizeStringList(rule.include);
  const exclude = normalizeStringList(rule.exclude);
  validateRuleBase(rule, key, include);

  if (rule.strategy === "entry") {
    assertUnsupportedStrategyKeys(rule, key, ["maxBundleSize", "aggregate"]);
    return { exclude, include, key, strategy: "entry" };
  }

  if (rule.strategy === "bundle") {
    assertUnsupportedStrategyKeys(rule, key, ["aggregate"]);
    return { exclude, include, key, maxBundleSize: parseBundleMaxSize(rule.maxBundleSize), strategy: "bundle" };
  }

  if (rule.strategy === "ignore") {
    assertUnsupportedStrategyKeys(rule, key, ["maxBundleSize", "aggregate"]);
    return { exclude, include, key, strategy: "ignore" };
  }

  assertUnsupportedStrategyKeys(rule, key, ["maxBundleSize"]);
  return {
    aggregate: normalizeAggregateModuleMap(rule.aggregate, key),
    exclude,
    include,
    key,
    strategy: "aggregate",
  };
}

function normalizeDiscoverOptions(
  rootDir: string,
  discover: BundlerOptions["discover"],
): NormalizedDiscoverOptions[] {
  const list = Array.isArray(discover) ? discover : discover ? [discover] : [];
  if (list.length === 0) throw new Error("bundler-missing-discover");

  const normalized = list
    .map((item) => item && typeof item === "object" ? item : null)
    .filter(Boolean)
    .map((item) => normalizeDiscoverConfig(rootDir, item!));

  validateRuleKeys(normalized);
  return normalized;
}

function normalizeDiscoverConfig(rootDir: string, item: NonNullable<Exclude<BundlerOptions["discover"], BundlerOptions["discover"][]>>): NormalizedDiscoverOptions {
  const dir = normalizePathValue(item.dir);
  if (!dir) throw new Error("bundler-discover-missing-dir");
  const rules = (item.rules || []).map(normalizeDiscoverRule);
  if (rules.length === 0) throw new Error(`bundler-discover-missing-rules :: ${dir}`);

  return {
    dir,
    dirAbs: path.resolve(rootDir, dir),
    ignoreDirs: new Set([...DEFAULT_IGNORE_DIRS, ...normalizeStringList(item.ignoreDirs)].map((value) => path.basename(value))),
    rules,
  };
}

function normalizeManifestOptions(manifest: import("#jb343639kom2").BundlerManifestOptions | undefined): import("./shared.js").NormalizedManifestOptions {
  if (!manifest) return { enabled: false };
  if (manifest === true) return { enabled: true, file: "bundler-manifest.json" };
  return { enabled: true, file: normalizePathValue(manifest.file || "bundler-manifest.json") };
}

function validateAggregateExports(ruleKey: string, entries: Array<readonly [string, string]>): void {
  for (const [label, value] of entries) {
    if (!isValidIdentifier(value)) {
      throw new Error(`bundler-discover-aggregate-invalid-export-name :: ${ruleKey} :: ${label}`);
    }
  }
}

function validateRuleBase(rule: BundlerDiscoverRule, key: string, include: string[]): void {
  if (!key) throw new Error("bundler-discover-rule-missing-key");
  if (include.length === 0) throw new Error(`bundler-discover-rule-missing-include :: ${key}`);
  void rule;
}

function assertUnsupportedStrategyKeys(rule: BundlerDiscoverRule, key: string, names: string[]): void {
  for (const name of names) {
    if (!(name in rule) || (rule as Record<string, unknown>)[name] == null) continue;
    if (name === "maxBundleSize") throw new Error(`bundler-discover-rule-invalid-max-size-strategy :: ${key}`);
    if (name === "aggregate") throw new Error(`bundler-discover-rule-invalid-aggregate-strategy :: ${key}`);
  }
}

function validateRuleKeys(configs: NormalizedDiscoverOptions[]): void {
  const seenRuleKeys = new Set<string>();
  for (const config of configs) {
    for (const rule of config.rules) {
      if (seenRuleKeys.has(rule.key)) throw new Error(`bundler-discover-duplicate-rule-key :: ${rule.key}`);
      seenRuleKeys.add(rule.key);
    }
  }
}

export {
  normalizeAggregateModuleMap,
  normalizeDiscoverOptions,
  normalizeDiscoverRule,
  normalizeManifestOptions,
};
