import type {
  BundlerEntryRecord,
  BundlerResolvedDiscovery,
  BundlerResolvedRule,
  BundlerVirtualEntryLoader,
} from "#jb343639kom2";
import { assignSourceOwner } from "./scan.js";
import { toRootImportSpecifier } from "./shared.js";
import type { DiscoveredFile } from "./shared.js";

function emitEntryRecord(args: {
  emittedKeys: Set<string>;
  emittedNames: Set<string>;
  record: BundlerEntryRecord;
  resolvedEntries: BundlerEntryRecord[];
  ruleRecord: BundlerResolvedRule;
  sourceOwners: Map<string, string>;
}): void {
  assertUniqueEntryRecord(args.record, args.emittedKeys, args.emittedNames);
  args.emittedKeys.add(args.record.key);
  args.emittedNames.add(args.record.name);
  args.resolvedEntries.push(args.record);
  args.ruleRecord.entryKeys.push(args.record.key);
  for (const sourcePath of args.record.ownedSources) {
    assignSourceOwner({ entryKey: args.record.key, sourceOwners: args.sourceOwners, sourcePath });
  }
}

function assertUniqueEntryRecord(
  record: BundlerEntryRecord,
  emittedKeys: Set<string>,
  emittedNames: Set<string>,
): void {
  if (emittedKeys.has(record.key)) throw new Error(`bundler-discover-entry-key-conflict :: ${record.key}`);
  if (emittedNames.has(record.name)) throw new Error(`bundler-discover-output-name-conflict :: ${record.name}`);
}

function createResolvedDiscovery(args: {
  resolvedEntries: BundlerEntryRecord[];
  rules: Map<string, BundlerResolvedRule>;
  sourceOwners: Map<string, string>;
}): BundlerResolvedDiscovery {
  return {
    entries: args.resolvedEntries.sort((a, b) => a.key.localeCompare(b.key)),
    rules: Object.fromEntries(Array.from(args.rules.entries()).sort(([a], [b]) => a.localeCompare(b))),
    sourceOwners: Object.fromEntries(Array.from(args.sourceOwners.entries()).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function buildBundleContents(args: {
  files: DiscoveredFile[];
  loader: BundlerVirtualEntryLoader;
  rootDir: string;
}): string {
  if (args.loader === "css") {
    return args.files
      .map((file) => `@import ${JSON.stringify(toRootImportSpecifier(args.rootDir, file.absPath))};`)
      .join("\n");
  }

  return args.files
    .map((file) => `import ${JSON.stringify(toRootImportSpecifier(args.rootDir, file.absPath))};`)
    .join("\n");
}

export {
  buildBundleContents,
  createResolvedDiscovery,
  emitEntryRecord,
};
