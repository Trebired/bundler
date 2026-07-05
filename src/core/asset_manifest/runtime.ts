import path from "node:path";

import type {
  BundlerAssetManifest,
  BundlerAssetManifestEntry,
  BundlerBuildAssetManifestOptions,
  BundlerCollectedAssetLinks,
  BundlerCollectAssetLinksLookup,
  BundlerCollectAssetLinksOptions,
  BundlerEntryRecord,
} from "#jb343639kom2";
import { deriveManifest } from "#c460d1e7c1c3";
import { toPosixPath } from "#c16c81be3058";

function normalizeKey(value: unknown): string {
  return toPosixPath(String(value || "").trim()).replace(/^\.\/+/, "").replace(/^\/+|\/+$/g, "");
}

function normalizeSourcePath(value: unknown, rootDir: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("virtual:")) return normalizeKey(raw);
  return normalizeKey(path.relative(rootDir, path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw)));
}

function normalizeOutputPath(value: unknown, rootDir: string, outDir: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (path.isAbsolute(raw)) return normalizeKey(path.relative(outDir, raw));

  const normalized = normalizeKey(raw);
  const outDirRel = normalizeKey(path.relative(rootDir, outDir));
  return outDirRel && normalized.startsWith(`${outDirRel}/`) ? normalized.slice(outDirRel.length + 1) : normalized;
}

function buildAssetManifest(options: BundlerBuildAssetManifestOptions): BundlerAssetManifest {
  const rootDir = path.resolve(options.rootDir);
  const outDir = path.resolve(rootDir, options.outDir);
  const derived = deriveManifest(options.metafile, { outDir, rootDir });
  const resolvedDiscovery = options.resolvedDiscovery || { entries: [], rules: {}, sourceOwners: {} };
  const manifest = createEmptyManifest(resolvedDiscovery);
  const entryByLookupKey = new Map(
    resolvedDiscovery.entries.map((entry) => [toEntryPointLookupKey(entry), entry] as const).filter(([key]) => Boolean(key)),
  );

  populateManifestOutputs(manifest, derived.allOutputs, entryByLookupKey, rootDir, outDir);
  populateManifestEntries(manifest, resolvedDiscovery.entries, derived, rootDir, outDir);
  return sortManifest(manifest);
}

function collectAssetLinks(
  manifest: BundlerAssetManifest,
  entryIds: string[],
  options: BundlerCollectAssetLinksOptions = {},
): BundlerCollectedAssetLinks {
  const state = {
    assets: new Set<string>(),
    entryKeys: [] as string[],
    missing: [] as string[],
    outputs: new Set<string>(),
    scripts: new Set<string>(),
    seenKeys: new Set<string>(),
    styles: new Set<string>(),
  };

  for (const entryId of entryIds || []) {
    const entryKeysForId = resolveEntryKeys(manifest, entryId, options.from || "auto");
    if (entryKeysForId.length === 0) {
      pushMissingEntryId(state.missing, entryId);
      continue;
    }
    entryKeysForId.forEach((entryKey) => addEntryLinks(manifest, state, entryKey, options.publicPath));
  }

  return {
    entryKeys: state.entryKeys,
    scripts: Array.from(state.scripts),
    styles: Array.from(state.styles),
    assets: Array.from(state.assets),
    outputs: Array.from(state.outputs),
    missing: state.missing,
  };
}

function toStableList(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).filter(Boolean))).sort();
}

function toEntryPointLookupKey(entry: BundlerEntryRecord): string {
  return entry.source === "internal" ? `virtual:${normalizeKey(entry.name)}` : normalizeKey(entry.entrySource || "");
}

function collectReachableOutputs(args: {
  entryOutput: string;
  outputs: ReturnType<typeof deriveManifest>["allOutputs"];
}): string[] {
  const seen = new Set<string>();
  const stack = [args.entryOutput];
  while (stack.length) {
    const current = stack.pop()!;
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const output = args.outputs[current];
    if (!output) continue;
    output.imports.forEach((imported) => {
      if (args.outputs[imported]) stack.push(imported);
    });
    output.css.forEach((css) => {
      if (args.outputs[css]) stack.push(css);
    });
  }
  return Array.from(seen).sort();
}

function createEntryRecord(args: {
  entry: BundlerEntryRecord;
  entryOutput: string;
  imports: string[];
  js: string[];
  outputs: string[];
}): BundlerAssetManifestEntry {
  const js = toStableList(args.js);
  const css = toStableList(args.outputs.filter((value) => value.endsWith(".css")));
  const outputs = toStableList(args.outputs);
  const jsSet = new Set(js);
  const cssSet = new Set(css);

  return {
    aggregate: args.entry.aggregate,
    key: args.entry.key,
    kind: args.entry.kind,
    ruleKey: args.entry.ruleKey,
    strategy: args.entry.strategy,
    entrySource: args.entry.entrySource,
    generated: args.entry.generated,
    sources: args.entry.ownedSources.slice().sort(),
    file: args.entryOutput,
    entryOutput: args.entryOutput,
    outputs,
    js,
    css,
    assets: outputs.filter((value) => !jsSet.has(value) && !cssSet.has(value)),
    imports: toStableList(args.imports),
  };
}

function createEmptyManifest(resolvedDiscovery: NonNullable<BundlerBuildAssetManifestOptions["resolvedDiscovery"]>): BundlerAssetManifest {
  return {
    entries: {},
    sources: {},
    entryOutputs: {},
    outputs: {},
    rules: Object.fromEntries(Object.entries(resolvedDiscovery.rules).map(([ruleKey, rule]) => [
      ruleKey,
      {
        aggregate: rule.aggregate,
        entryKeys: rule.entryKeys.slice().sort(),
        ignoredSources: rule.ignoredSources.slice().sort(),
        ruleKey: rule.ruleKey,
        strategy: rule.strategy,
      },
    ])),
  };
}

function populateManifestOutputs(
  manifest: BundlerAssetManifest,
  allOutputs: ReturnType<typeof deriveManifest>["allOutputs"],
  entryByLookupKey: Map<string, BundlerEntryRecord>,
  rootDir: string,
  outDir: string,
): void {
  for (const output of Object.values(allOutputs)) {
    const lookupKey = output.entryPoint ? normalizeSourcePath(output.entryPoint, rootDir) : "";
    const entry = lookupKey ? entryByLookupKey.get(lookupKey) : undefined;
    const outputKey = normalizeOutputPath(output.output, rootDir, outDir);
    if (!outputKey) continue;
    if (entry && output.kind === "entry") manifest.entryOutputs[output.output] = entry.key;

    manifest.outputs[outputKey] = {
      output: outputKey,
      kind: output.kind,
      entryKey: entry?.key,
      entryPoint: entry?.entrySource,
      inputs: output.inputs.map((value) => normalizeSourcePath(value, rootDir)).filter(Boolean),
      css: output.css.map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean),
      imports: output.imports.map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean),
      bytes: output.bytes,
      ruleKey: entry?.ruleKey,
      strategy: entry?.strategy,
    };
  }
}

function populateManifestEntries(
  manifest: BundlerAssetManifest,
  entries: BundlerEntryRecord[],
  derived: ReturnType<typeof deriveManifest>,
  rootDir: string,
  outDir: string,
): void {
  for (const entry of entries) {
    const derivedEntry = findDerivedEntry(derived, entry, rootDir);
    if (!derivedEntry) continue;
    const entryOutput = normalizeOutputPath(derivedEntry.entryOutput, rootDir, outDir);
    if (!entryOutput) continue;
    const reachableOutputs = collectReachableOutputs({
      entryOutput: derivedEntry.entryOutput,
      outputs: derived.allOutputs,
    }).map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean);

    manifest.entries[entry.key] = createEntryRecord({
      entry,
      entryOutput,
      outputs: reachableOutputs,
      js: derivedEntry.js.map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean),
      imports: derivedEntry.imports.map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean),
    });
    manifest.entryOutputs[entryOutput] = entry.key;
    entry.ownedSources.forEach((sourcePath) => {
      manifest.sources[sourcePath] = {
        source: sourcePath,
        entryKey: entry.key,
        ruleKey: entry.ruleKey,
        strategy: entry.strategy,
        outputs: reachableOutputs,
      };
    });
  }
}

function findDerivedEntry(
  derived: ReturnType<typeof deriveManifest>,
  entry: BundlerEntryRecord,
  rootDir: string,
) {
  const lookupKey = toEntryPointLookupKey(entry);
  return Object.values(derived.entries).find((item) => {
    const output = derived.allOutputs[item.entryOutput];
    return output?.entryPoint && normalizeSourcePath(output.entryPoint, rootDir) === lookupKey;
  });
}

function sortManifest(manifest: BundlerAssetManifest): BundlerAssetManifest {
  return {
    entries: Object.fromEntries(Object.entries(manifest.entries).sort(([a], [b]) => a.localeCompare(b))),
    sources: Object.fromEntries(Object.entries(manifest.sources).sort(([a], [b]) => a.localeCompare(b))),
    entryOutputs: Object.fromEntries(Object.entries(manifest.entryOutputs).sort(([a], [b]) => a.localeCompare(b))),
    outputs: Object.fromEntries(Object.entries(manifest.outputs).sort(([a], [b]) => a.localeCompare(b))),
    rules: Object.fromEntries(Object.entries(manifest.rules).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function toPublicPath(publicPath: string | undefined, value: string): string {
  const normalizedValue = normalizeKey(value);
  const base = String(publicPath || "").trim();
  if (!base) return normalizedValue;
  if (base === "/") return normalizedValue ? `/${normalizedValue}` : "/";
  return `${base.replace(/\/+$/g, "")}/${normalizedValue.replace(/^\/+/g, "")}`;
}

function resolveEntryKeys(
  manifest: BundlerAssetManifest,
  entryId: string,
  from: BundlerCollectAssetLinksLookup,
): string[] {
  const normalizedId = normalizeKey(entryId);
  if (!normalizedId) return [];
  if (from === "entryKey") return manifest.entries[normalizedId] ? [normalizedId] : [];
  if (from === "source") return manifest.sources[normalizedId]?.entryKey ? [manifest.sources[normalizedId]!.entryKey] : [];
  if (from === "entryOutput") return manifest.entryOutputs[normalizedId] ? [manifest.entryOutputs[normalizedId]!] : [];
  if (from === "ruleKey") return manifest.rules[normalizedId]?.entryKeys.slice() || [];
  if (manifest.entries[normalizedId]) return [normalizedId];
  if (manifest.sources[normalizedId]?.entryKey) return [manifest.sources[normalizedId]!.entryKey];
  if (manifest.entryOutputs[normalizedId]) return [manifest.entryOutputs[normalizedId]!];
  return manifest.rules[normalizedId]?.entryKeys.slice() || [];
}

function pushMissingEntryId(missing: string[], entryId: string): void {
  const normalizedId = normalizeKey(entryId);
  if (normalizedId && !missing.includes(normalizedId)) missing.push(normalizedId);
}

function addEntryLinks(
  manifest: BundlerAssetManifest,
  state: {
    assets: Set<string>;
    entryKeys: string[];
    outputs: Set<string>;
    scripts: Set<string>;
    seenKeys: Set<string>;
    styles: Set<string>;
  },
  entryKey: string,
  publicPath: string | undefined,
): void {
  if (state.seenKeys.has(entryKey)) return;
  state.seenKeys.add(entryKey);
  state.entryKeys.push(entryKey);
  const entry = manifest.entries[entryKey];
  if (!entry) return;
  entry.outputs.forEach((output) => state.outputs.add(toPublicPath(publicPath, output)));
  entry.assets.forEach((asset) => state.assets.add(toPublicPath(publicPath, asset)));
  entry.css.forEach((style) => state.styles.add(toPublicPath(publicPath, style)));
  if (/\.(?:[mc]?js)$/i.test(entry.file)) state.scripts.add(toPublicPath(publicPath, entry.file));
}

export {
  buildAssetManifest,
  collectAssetLinks,
};
