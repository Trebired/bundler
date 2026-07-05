import path from "node:path";

import type {
  BundlerAggregateEntryMetadata,
  BundlerAggregateRuleMetadata,
} from "#jb343639kom2";
import {
  commonPathPrefix,
  normalizePathValue,
  resolveAggregateModuleLoader,
  resolveModuleCandidate,
  staticPatternBase,
  toPosixDirname,
  toRootImportSpecifier,
} from "./shared.js";
import type {
  DiscoveredFile,
  NormalizedAggregateModuleMap,
  NormalizedAggregateRule,
  NormalizedDiscoverOptions,
  ResolvedAggregateRootModule,
} from "./shared.js";

function computeAggregateKeyRoot(includePatterns: string[], matchedFiles: DiscoveredFile[]): string {
  const includeBase = commonPathPrefix(includePatterns.map(staticPatternBase).filter(Boolean));
  if (includeBase) return includeBase;
  return commonPathPrefix(matchedFiles.map((file) => toPosixDirname(file.discoverRel)).filter(Boolean));
}

function normalizeAggregatePathKey(args: {
  collapseIndex: boolean;
  file: DiscoveredFile;
  keyRoot: string;
}): string {
  const fromRoot = args.keyRoot
    ? normalizePathValue(path.posix.relative(args.keyRoot, args.file.discoverRel))
    : normalizePathValue(args.file.discoverRel);
  const ext = path.extname(fromRoot);
  let withoutExt = ext ? fromRoot.slice(0, -ext.length) : fromRoot;
  if (args.collapseIndex && withoutExt.endsWith("/index")) {
    withoutExt = withoutExt.slice(0, -"/index".length);
  }
  return normalizePathValue(withoutExt);
}

function validateAggregatePathKeys(args: {
  collapseIndex: boolean;
  matchedFiles: DiscoveredFile[];
  rule: NormalizedAggregateRule;
}): void {
  const keyRoot = computeAggregateKeyRoot(args.rule.include, args.matchedFiles);
  const seen = new Map<string, string>();

  for (const file of args.matchedFiles) {
    const pathKey = normalizeAggregatePathKey({ collapseIndex: args.collapseIndex, file, keyRoot });
    const existing = seen.get(pathKey);
    if (existing && existing !== file.rootRel) {
      throw new Error(`bundler-discover-aggregate-path-key-conflict :: ${args.rule.key} :: ${pathKey}`);
    }
    seen.set(pathKey, file.rootRel);
  }
}

function createAggregateEntryMetadata(args: {
  matchedFiles: DiscoveredFile[];
  rootModule?: ResolvedAggregateRootModule;
}): BundlerAggregateEntryMetadata {
  return {
    kind: "module-map",
    matchedSources: args.matchedFiles.map((file) => file.rootRel),
    rootModule: args.rootModule?.rootRel,
  };
}

function createAggregateRuleMetadata(rootModule?: ResolvedAggregateRootModule): BundlerAggregateRuleMetadata {
  return {
    kind: "module-map",
    rootModule: rootModule?.rootRel,
  };
}

function buildAggregateModuleMapContents(args: {
  aggregate: NormalizedAggregateModuleMap;
  includePatterns: string[];
  matchedFiles: DiscoveredFile[];
  rootDir: string;
  rootModule?: ResolvedAggregateRootModule;
}): string {
  const bindings = {
    map: "__bundler_module_map",
    resolver: "__bundler_get_module",
    root: "__bundler_root_module",
  };
  const lines = buildAggregatePrelude(args, bindings);
  const actualKeyRoot = computeAggregateKeyRoot(args.includePatterns, args.matchedFiles);

  appendAggregateMap(lines, args, actualKeyRoot, bindings);
  appendAggregateExports(lines, args, bindings);
  return lines.join("\n");
}

function resolveAggregateRootModule(args: {
  config: NormalizedDiscoverOptions;
  rootDir: string;
  rule: NormalizedAggregateRule;
}): ResolvedAggregateRootModule | undefined {
  if (!args.rule.aggregate.rootModule) return undefined;
  const raw = args.rule.aggregate.rootModule;
  const basePath = path.isAbsolute(raw) ? raw : path.resolve(args.config.dirAbs, raw);
  const resolved = resolveModuleCandidate(basePath);
  if (!resolved) throw new Error(`bundler-discover-aggregate-root-module-not-found :: ${args.rule.key} :: ${raw}`);

  const rootRel = normalizePathValue(path.relative(args.rootDir, resolved));
  if (!resolveAggregateModuleLoader(rootRel)) {
    throw new Error(`bundler-discover-aggregate-unsupported-root-module :: ${args.rule.key} :: ${rootRel}`);
  }

  return { absPath: resolved, rootRel };
}

function buildAggregatePrelude(
  args: {
    aggregate: NormalizedAggregateModuleMap;
    matchedFiles: DiscoveredFile[];
    rootDir: string;
    rootModule?: ResolvedAggregateRootModule;
  },
  bindings: {
    map: string;
    resolver: string;
    root: string;
  },
): string[] {
  const lines: string[] = [];
  if (args.rootModule) {
    lines.push(`import * as __bundler_root_namespace from ${JSON.stringify(toRootImportSpecifier(args.rootDir, args.rootModule.absPath))};`);
  }
  args.matchedFiles.forEach((file, index) => {
    lines.push(`import * as __bundler_module_${index} from ${JSON.stringify(toRootImportSpecifier(args.rootDir, file.absPath))};`);
  });
  lines.push("");
  if (args.rootModule) {
    lines.push(`const ${bindings.root} = __bundler_root_namespace[${JSON.stringify(args.aggregate.rootModuleExportName)}];`);
    lines.push("");
  }
  return lines;
}

function appendAggregateMap(
  lines: string[],
  args: {
    aggregate: NormalizedAggregateModuleMap;
    matchedFiles: DiscoveredFile[];
  },
  actualKeyRoot: string,
  bindings: {
    map: string;
    resolver: string;
  },
): void {
  lines.push(`const ${bindings.map} = {`);
  args.matchedFiles.forEach((file, index) => {
    lines.push(`  ${JSON.stringify(normalizeAggregatePathKey({
      collapseIndex: args.aggregate.collapseIndex,
      file,
      keyRoot: actualKeyRoot,
    }))}: __bundler_module_${index}[${JSON.stringify(args.aggregate.matchedModuleExportName)}],`);
  });
  lines.push("};");
  lines.push("");
  lines.push(`function ${bindings.resolver}(key) {`);
  lines.push(`  return ${bindings.map}[key];`);
  lines.push("}");
  lines.push("");
}

function appendAggregateExports(
  lines: string[],
  args: {
    aggregate: NormalizedAggregateModuleMap;
    rootModule?: ResolvedAggregateRootModule;
  },
  bindings: {
    map: string;
    resolver: string;
    root: string;
  },
): void {
  const exportSpecifiers = [
    `${bindings.map} as ${args.aggregate.exports.map}`,
    `${bindings.resolver} as ${args.aggregate.exports.resolver}`,
  ];
  if (args.rootModule && args.aggregate.exports.root) {
    exportSpecifiers.push(`${bindings.root} as ${args.aggregate.exports.root}`);
  }
  lines.push(`export { ${exportSpecifiers.join(", ")} };`);
  if (!args.aggregate.exports.default) return;

  const defaultMembers = [
    `${args.aggregate.exports.map}: ${bindings.map}`,
    `${args.aggregate.exports.resolver}: ${bindings.resolver}`,
  ];
  if (args.rootModule && args.aggregate.exports.root) {
    defaultMembers.push(`${args.aggregate.exports.root}: ${bindings.root}`);
  }
  lines.push("");
  lines.push(`export default { ${defaultMembers.join(", ")} };`);
}

export {
  buildAggregateModuleMapContents,
  computeAggregateKeyRoot,
  createAggregateEntryMetadata,
  createAggregateRuleMetadata,
  normalizeAggregatePathKey,
  resolveAggregateRootModule,
  validateAggregatePathKeys,
};
