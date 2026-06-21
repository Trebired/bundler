import fs from "node:fs";
import path from "node:path";

import type {
  BundlerImportGraph,
  BundlerImportGraphFile,
  BundlerImportGraphOptions,
} from "#jb343639kom2";
import { collectImports } from "./parse.js";
import { applyTsconfigMatcher, loadTsconfig } from "./tsconfig.js";
import {
  DEFAULT_IMPORT_GRAPH_EXTENSIONS,
  normalizePathInRoot,
} from "./shared.js";
import type { LoadedTsconfig } from "./shared.js";

function resolveFileCandidate(baseAbs: string, extensions: string[]): string {
  const candidates = [
    baseAbs,
    ...extensions.map((extension) => `${baseAbs}${extension}`),
    ...extensions.map((extension) => path.join(baseAbs, `index${extension}`)),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      if (fs.statSync(candidate).isFile()) return path.resolve(candidate);
    } catch {}
  }

  return "";
}

function resolveImportSpecifier(args: {
  fromAbs: string;
  rootDir: string;
  specifier: string;
  extensions: string[];
  tsconfig: LoadedTsconfig;
}): string {
  const specifier = String(args.specifier || "").trim();
  if (!specifier) return "";
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return resolveFileCandidate(path.resolve(path.dirname(args.fromAbs), specifier), args.extensions);
  }
  if (specifier.startsWith("/")) {
    return resolveFileCandidate(path.resolve(args.rootDir, `.${specifier}`), args.extensions);
  }

  for (const matcher of args.tsconfig.matchers) {
    for (const candidate of applyTsconfigMatcher(specifier, matcher)) {
      const resolved = resolveFileCandidate(candidate, args.extensions);
      if (resolved) return resolved;
    }
  }

  return args.tsconfig.baseUrlAbs
    ? resolveFileCandidate(path.resolve(args.tsconfig.baseUrlAbs, specifier), args.extensions)
    : "";
}

async function walkImportGraph(options: BundlerImportGraphOptions): Promise<BundlerImportGraph> {
  const rootDir = path.resolve(String(options.rootDir || "").trim() || process.cwd());
  const extensions = normalizeExtensions(options.extensions);
  const tsconfig = loadTsconfig(rootDir, options.tsconfig);
  const entryAbsList = normalizeEntryAbsList(options.entries, rootDir);
  const files = new Map<string, BundlerImportGraphFile>();
  const visitedAbs = new Set<string>();

  const visit = (fileAbs: string): void => {
    const normalizedAbs = path.resolve(fileAbs);
    if (visitedAbs.has(normalizedAbs) || !fs.existsSync(normalizedAbs)) return;
    if (!fs.statSync(normalizedAbs).isFile()) return;
    visitedAbs.add(normalizedAbs);

    const file = createImportGraphFile(normalizedAbs, rootDir, extensions, tsconfig);
    files.set(file.path, file);
    for (const item of file.imports) {
      if (!item.resolved) continue;
      visit(path.resolve(rootDir, item.resolved));
    }
  };

  entryAbsList.forEach(visit);
  return {
    entries: entryAbsList.map((value) => normalizePathInRoot(rootDir, value)),
    files: Object.fromEntries(Array.from(files.entries()).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function normalizeExtensions(extensions: string[] | undefined): string[] {
  return (extensions && extensions.length ? extensions : DEFAULT_IMPORT_GRAPH_EXTENSIONS)
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .map((value) => value.startsWith(".") ? value : `.${value}`);
}

function normalizeEntryAbsList(entries: string | string[], rootDir: string): string[] {
  const entryList = Array.isArray(entries) ? entries : [entries];
  return entryList
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootDir, value));
}

function createImportGraphFile(
  normalizedAbs: string,
  rootDir: string,
  extensions: string[],
  tsconfig: LoadedTsconfig,
): BundlerImportGraphFile {
  const source = fs.readFileSync(normalizedAbs, "utf8");
  const imports = collectImports(source).map((item) => {
    const resolvedAbs = resolveImportSpecifier({
      fromAbs: normalizedAbs,
      rootDir,
      specifier: item.specifier,
      extensions,
      tsconfig,
    });
    const inRoot = resolvedAbs ? normalizePathInRoot(rootDir, resolvedAbs) : "";
    const resolved = inRoot && !inRoot.startsWith("..") ? inRoot : undefined;
    return { ...item, external: !resolved, resolved };
  });

  return {
    path: normalizePathInRoot(rootDir, normalizedAbs),
    imports,
  };
}

export {
  walkImportGraph,
};
