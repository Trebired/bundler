import path from "node:path";
import type { Metafile } from "esbuild";

import type {
  BundlerDerivedManifest,
  BundlerDerivedManifestChunk,
  BundlerDerivedManifestEntry,
  BundlerDerivedManifestOutput,
  BundlerDerivedManifestOutputKind,
} from "#jb343639kom2";
import { VIRTUAL_ENTRY_NAMESPACE } from "#18o0cf9c108j";
import { VIRTUAL_ENTRY_PREFIX, toPosixPath } from "#c16c81be3058";

type DeriveManifestOptions = {
  outDir: string;
  rootDir: string;
};

function normalizeFilePath(filePath: string, rootDir: string): string {
  if (filePath.startsWith(VIRTUAL_ENTRY_PREFIX)) return `virtual:${filePath.slice(VIRTUAL_ENTRY_PREFIX.length)}`;
  if (filePath.startsWith(`${VIRTUAL_ENTRY_NAMESPACE}:`)) return `virtual:${filePath.slice(VIRTUAL_ENTRY_NAMESPACE.length + 1)}`;
  return toPosixPath(path.relative(rootDir, path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath)));
}

function deriveManifest(metafile: Metafile, options: DeriveManifestOptions): BundlerDerivedManifest {
  const outputs = Object.entries(metafile.outputs).sort(([a], [b]) => a.localeCompare(b));
  const importedOutputs = collectImportedOutputs(metafile, outputs, options.rootDir);
  const entries: Record<string, BundlerDerivedManifestEntry> = {};
  const chunks: Record<string, BundlerDerivedManifestChunk> = {};
  const allOutputs = buildAllOutputs(metafile, outputs, importedOutputs, options);

  for (const [outputPath] of outputs) {
    const outputRel = normalizeFilePath(outputPath, options.rootDir);
    const outputInfo = allOutputs[outputRel];
    if (!outputInfo) continue;
    if (outputInfo.kind === "entry") entries[outputRel] = createDerivedEntry(outputRel, outputPath, outputInfo, allOutputs, metafile, options.rootDir);
    if (outputInfo.kind === "chunk") chunks[outputRel] = createDerivedChunk(outputRel, outputInfo);
  }

  return {
    entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))),
    chunks: Object.fromEntries(Object.entries(chunks).sort(([a], [b]) => a.localeCompare(b))),
    allOutputs: Object.fromEntries(Object.entries(allOutputs).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function collectImportedOutputs(
  metafile: Metafile,
  outputs: Array<[string, Metafile["outputs"][string]]>,
  rootDir: string,
): Set<string> {
  const importedOutputs = new Set<string>();
  for (const [, output] of outputs) {
    for (const imported of output.imports) {
      if (!imported.external && metafile.outputs[imported.path]) importedOutputs.add(normalizeFilePath(imported.path, rootDir));
    }
  }
  return importedOutputs;
}

function buildAllOutputs(
  metafile: Metafile,
  outputs: Array<[string, Metafile["outputs"][string]]>,
  importedOutputs: Set<string>,
  options: DeriveManifestOptions,
): Record<string, BundlerDerivedManifestOutput> {
  const allOutputs: Record<string, BundlerDerivedManifestOutput> = {};
  for (const [outputPath, outputValue] of outputs) {
    const outputRel = normalizeFilePath(outputPath, options.rootDir);
    allOutputs[outputRel] = {
      output: outputRel,
      kind: resolveOutputKind(importedOutputs, outputRel, outputValue),
      entryPoint: outputValue.entryPoint ? normalizeFilePath(outputValue.entryPoint, options.rootDir) : undefined,
      entryName: deriveEntryName(outputPath, outputValue, options),
      inputs: Object.keys(outputValue.inputs).map((value) => normalizeFilePath(value, options.rootDir)).sort(),
      css: resolveOutputCss(outputRel, outputValue, options.rootDir),
      imports: resolveImportedOutputs(metafile, outputPath, options.rootDir),
      bytes: outputValue.bytes,
    };
  }
  return allOutputs;
}

function createDerivedEntry(
  outputRel: string,
  outputPath: string,
  outputInfo: BundlerDerivedManifestOutput,
  allOutputs: Record<string, BundlerDerivedManifestOutput>,
  metafile: Metafile,
  rootDir: string,
): BundlerDerivedManifestEntry {
  const reachable = collectReachableOutputs(metafile, outputPath, rootDir);
  return {
    entryOutput: outputRel,
    entryName: outputInfo.entryName,
    inputs: outputInfo.inputs,
    js: reachable.filter((value) => /\.(?:[mc]?js)$/i.test(value)),
    css: Array.from(new Set(reachable.flatMap((value) => {
      const info = allOutputs[value];
      return info ? info.css : value.endsWith(".css") ? [value] : [];
    }))).sort(),
    imports: outputInfo.imports,
  };
}

function createDerivedChunk(outputRel: string, outputInfo: BundlerDerivedManifestOutput): BundlerDerivedManifestChunk {
  return {
    output: outputRel,
    inputs: outputInfo.inputs,
    css: outputInfo.css,
    imports: outputInfo.imports,
  };
}

function resolveImportedOutputs(metafile: Metafile, outputPath: string, rootDir: string): string[] {
  const output = metafile.outputs[outputPath];
  if (!output) return [];
  return output.imports.filter((item) => !item.external && Boolean(metafile.outputs[item.path])).map((item) => normalizeFilePath(item.path, rootDir)).sort();
}

function resolveOutputKind(
  importedOutputs: Set<string>,
  outputRel: string,
  outputValue: Metafile["outputs"][string],
): BundlerDerivedManifestOutputKind {
  if (outputValue.entryPoint) return "entry";
  if (importedOutputs.has(outputRel) || /\.(?:[mc]?js)$/i.test(outputRel)) return "chunk";
  return "asset";
}

function deriveEntryName(
  entryOutput: string,
  outputValue: Metafile["outputs"][string],
  options: DeriveManifestOptions,
): string | undefined {
  if (outputValue.entryPoint) return stripExtension(normalizeFilePath(outputValue.entryPoint, options.rootDir));
  const absoluteOutDir = path.resolve(options.rootDir, options.outDir);
  const absoluteOutput = path.resolve(options.rootDir, entryOutput);
  const relOut = toPosixPath(path.relative(absoluteOutDir, absoluteOutput));
  if (!relOut || relOut.startsWith("..")) return undefined;
  return stripExtension(relOut);
}

function resolveOutputCss(
  outputRel: string,
  outputValue: Metafile["outputs"][string],
  rootDir: string,
): string[] {
  if (outputValue.cssBundle) return [normalizeFilePath(outputValue.cssBundle, rootDir)];
  return outputRel.endsWith(".css") ? [outputRel] : [];
}

function collectReachableOutputs(metafile: Metafile, outputPath: string, rootDir: string): string[] {
  const seen = new Set<string>();
  const stack = [outputPath];
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const currentOutput = metafile.outputs[current];
    if (!currentOutput) continue;
    for (const imported of currentOutput.imports) {
      if (!imported.external && metafile.outputs[imported.path]) stack.push(imported.path);
    }
  }
  return Array.from(seen).sort().map((value) => normalizeFilePath(value, rootDir));
}

function stripExtension(value: string): string {
  const ext = path.extname(value);
  return ext ? value.slice(0, -ext.length) : value;
}

export {
  deriveManifest,
};
export type {
  DeriveManifestOptions,
};
