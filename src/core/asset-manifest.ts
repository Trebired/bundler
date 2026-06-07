import path from "node:path";

import type {
  BundlerAssetManifest,
  BundlerAssetManifestEntry,
  BundlerBuildAssetManifestOptions,
  BundlerCollectedAssetLinks,
  BundlerCollectAssetLinksLookup,
  BundlerCollectAssetLinksOptions,
  BundlerEntryRecord,
} from "../types.js";
import { deriveManifest } from "./derive-manifest.js";
import { toPosixPath } from "./discovery.js";

function normalizeKey(value: unknown): string {
  return toPosixPath(String(value || "").trim()).replace(/^\.\/+/, "").replace(/^\/+|\/+$/g, "");
}

function normalizeSourcePath(value: unknown, rootDir: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("virtual:")) return normalizeKey(raw);

  const absolute = path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw);
  return normalizeKey(path.relative(rootDir, absolute));
}

function normalizeOutputPath(value: unknown, rootDir: string, outDir: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (path.isAbsolute(raw)) {
    return normalizeKey(path.relative(outDir, raw));
  }

  const normalized = normalizeKey(raw);
  if (!normalized) return "";

  const outDirRel = normalizeKey(path.relative(rootDir, outDir));
  if (outDirRel && normalized.startsWith(`${outDirRel}/`)) {
    return normalized.slice(outDirRel.length + 1);
  }

  return normalized;
}

function toStableList(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).filter(Boolean))).sort();
}

function toEntryPointLookupKey(entry: BundlerEntryRecord): string {
  return entry.source === "internal"
    ? `virtual:${normalizeKey(entry.name)}`
    : normalizeKey(entry.entrySource || "");
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

    for (const imported of output.imports) {
      if (args.outputs[imported]) {
        stack.push(imported);
      }
    }

    for (const css of output.css) {
      if (args.outputs[css]) {
        stack.push(css);
      }
    }
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

function buildAssetManifest(options: BundlerBuildAssetManifestOptions): BundlerAssetManifest {
  const rootDir = path.resolve(options.rootDir);
  const outDir = path.resolve(rootDir, options.outDir);
  const derived = deriveManifest(options.metafile, {
    outDir,
    rootDir,
  });
  const resolvedDiscovery = options.resolvedDiscovery || {
    entries: [],
    rules: {},
    sourceOwners: {},
  };

  const entries: BundlerAssetManifest["entries"] = {};
  const sources: BundlerAssetManifest["sources"] = {};
  const entryOutputs: BundlerAssetManifest["entryOutputs"] = {};
  const outputs: BundlerAssetManifest["outputs"] = {};
  const rules: BundlerAssetManifest["rules"] = Object.fromEntries(
    Object.entries(resolvedDiscovery.rules).map(([ruleKey, rule]) => [
      ruleKey,
      {
        aggregate: rule.aggregate,
        entryKeys: rule.entryKeys.slice().sort(),
        ignoredSources: rule.ignoredSources.slice().sort(),
        ruleKey: rule.ruleKey,
        strategy: rule.strategy,
      },
    ]),
  );

  const entryByLookupKey = new Map(
    resolvedDiscovery.entries
      .map((entry) => [toEntryPointLookupKey(entry), entry] as const)
      .filter(([lookupKey]) => Boolean(lookupKey)),
  );
  const entryKeyByOutput = new Map<string, string>();

  for (const output of Object.values(derived.allOutputs)) {
    const lookupKey = output.entryPoint ? normalizeSourcePath(output.entryPoint, rootDir) : "";
    const entry = lookupKey ? entryByLookupKey.get(lookupKey) : undefined;
    const outputKey = normalizeOutputPath(output.output, rootDir, outDir);

    if (!outputKey) continue;

    if (entry && output.kind === "entry") {
      entryKeyByOutput.set(output.output, entry.key);
    }

    outputs[outputKey] = {
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

  for (const entry of resolvedDiscovery.entries) {
    const lookupKey = toEntryPointLookupKey(entry);
    const derivedEntry = Object.values(derived.entries).find((item) => {
      const output = derived.allOutputs[item.entryOutput];
      return output?.entryPoint && normalizeSourcePath(output.entryPoint, rootDir) === lookupKey;
    });

    if (!derivedEntry) continue;

    const entryOutput = normalizeOutputPath(derivedEntry.entryOutput, rootDir, outDir);
    if (!entryOutput) continue;

    const reachableOutputs = collectReachableOutputs({
      entryOutput: derivedEntry.entryOutput,
      outputs: derived.allOutputs,
    }).map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean);

    entries[entry.key] = createEntryRecord({
      entry,
      entryOutput,
      outputs: reachableOutputs,
      js: derivedEntry.js.map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean),
      imports: derivedEntry.imports.map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean),
    });

    entryOutputs[entryOutput] = entry.key;

    for (const sourcePath of entry.ownedSources) {
      sources[sourcePath] = {
        source: sourcePath,
        entryKey: entry.key,
        ruleKey: entry.ruleKey,
        strategy: entry.strategy,
        outputs: reachableOutputs,
      };
    }
  }

  return {
    entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))),
    sources: Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))),
    entryOutputs: Object.fromEntries(Object.entries(entryOutputs).sort(([a], [b]) => a.localeCompare(b))),
    outputs: Object.fromEntries(Object.entries(outputs).sort(([a], [b]) => a.localeCompare(b))),
    rules: Object.fromEntries(Object.entries(rules).sort(([a], [b]) => a.localeCompare(b))),
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

  if (from === "entryKey") {
    return manifest.entries[normalizedId] ? [normalizedId] : [];
  }

  if (from === "source") {
    return manifest.sources[normalizedId]?.entryKey ? [manifest.sources[normalizedId]!.entryKey] : [];
  }

  if (from === "entryOutput") {
    return manifest.entryOutputs[normalizedId] ? [manifest.entryOutputs[normalizedId]!] : [];
  }

  if (from === "ruleKey") {
    return manifest.rules[normalizedId]?.entryKeys.slice() || [];
  }

  if (manifest.entries[normalizedId]) {
    return [normalizedId];
  }

  if (manifest.sources[normalizedId]?.entryKey) {
    return [manifest.sources[normalizedId]!.entryKey];
  }

  if (manifest.entryOutputs[normalizedId]) {
    return [manifest.entryOutputs[normalizedId]!];
  }

  return manifest.rules[normalizedId]?.entryKeys.slice() || [];
}

function collectAssetLinks(
  manifest: BundlerAssetManifest,
  entryIds: string[],
  options: BundlerCollectAssetLinksOptions = {},
): BundlerCollectedAssetLinks {
  const from = options.from || "auto";
  const publicPath = options.publicPath;
  const entryKeys: string[] = [];
  const missing: string[] = [];
  const scripts = new Set<string>();
  const styles = new Set<string>();
  const assets = new Set<string>();
  const outputs = new Set<string>();
  const seenKeys = new Set<string>();

  for (const entryId of entryIds || []) {
    const entryKeysForId = resolveEntryKeys(manifest, entryId, from);
    if (entryKeysForId.length === 0) {
      const normalizedId = normalizeKey(entryId);
      if (normalizedId && !missing.includes(normalizedId)) {
        missing.push(normalizedId);
      }
      continue;
    }

    for (const entryKey of entryKeysForId) {
      if (seenKeys.has(entryKey)) continue;
      seenKeys.add(entryKey);
      entryKeys.push(entryKey);

      const entry = manifest.entries[entryKey];
      if (!entry) continue;

      for (const output of entry.outputs) {
        outputs.add(toPublicPath(publicPath, output));
      }

      for (const asset of entry.assets) {
        assets.add(toPublicPath(publicPath, asset));
      }

      for (const style of entry.css) {
        styles.add(toPublicPath(publicPath, style));
      }

      if (/\.(?:[mc]?js)$/i.test(entry.file)) {
        scripts.add(toPublicPath(publicPath, entry.file));
      }
    }
  }

  return {
    entryKeys,
    scripts: Array.from(scripts),
    styles: Array.from(styles),
    assets: Array.from(assets),
    outputs: Array.from(outputs),
    missing,
  };
}

export { buildAssetManifest, collectAssetLinks };
