import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import type {
  BundlerImportGraph,
  BundlerImportGraphFile,
  BundlerImportGraphImport,
  BundlerImportGraphImportKind,
  BundlerImportGraphOptions,
  BundlerImportGraphTsconfigOptions,
  BundlerTsconfigPaths,
} from "../types.js";
import { toPosixPath } from "./discovery.js";

const DEFAULT_IMPORT_GRAPH_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".scss",
  ".css",
  ".json",
];

const IMPORT_FROM_RE = /\bimport\s+(?:type\s+)?(?:[\w*\s{},]+?)\s+from\s+["']([^"']+)["']/g;
const IMPORT_SIDE_EFFECT_RE = /\bimport\s+["']([^"']+)["']/g;
const EXPORT_FROM_RE = /\bexport\s+(?:type\s+)?(?:[\w*\s{},]+?)\s+from\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

type LoadedTsconfig = {
  baseUrlAbs?: string;
  matchers: TsconfigPathMatcher[];
};

type TsconfigPathMatcher = {
  key: string;
  prefix: string;
  suffix: string;
  hasWildcard: boolean;
  targets: string[];
};

const requireFromModule = createRequire(import.meta.url);

function normalizeKey(value: unknown): string {
  return toPosixPath(String(value || "").trim()).replace(/^\.\/+/, "");
}

function normalizePathInRoot(rootDir: string, value: string): string {
  return normalizeKey(path.relative(rootDir, value));
}

function stripJsonComments(source: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaping = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if ((char === "\"" || char === "'")) {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function stripTrailingCommas(source: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaping = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      output += char;
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === ",") {
      let lookAhead = index + 1;
      while (lookAhead < source.length && /\s/.test(source[lookAhead])) {
        lookAhead += 1;
      }
      const next = source[lookAhead];
      if (next === "}" || next === "]") {
        continue;
      }
    }

    output += char;
  }

  return output;
}

function parseJsonLike(text: string): any {
  return JSON.parse(stripTrailingCommas(stripJsonComments(text)));
}

function resolveTsconfigExtends(tsconfigAbs: string, specifier: string): string {
  const normalized = String(specifier || "").trim();
  if (!normalized) return "";

  if (normalized.startsWith(".") || normalized.startsWith("/")) {
    const candidate = path.resolve(path.dirname(tsconfigAbs), normalized);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    if (fs.existsSync(`${candidate}.json`) && fs.statSync(`${candidate}.json`).isFile()) return `${candidate}.json`;
    return "";
  }

  try {
    return requireFromModule.resolve(normalized, {
      paths: [path.dirname(tsconfigAbs)],
    });
  } catch {
    try {
      return requireFromModule.resolve(`${normalized}.json`, {
        paths: [path.dirname(tsconfigAbs)],
      });
    } catch {
      return "";
    }
  }
}

function createTsconfigMatchers(paths: BundlerTsconfigPaths | undefined, targetRootAbs: string): TsconfigPathMatcher[] {
  return Object.entries(paths || {})
    .map(([key, values]) => ({
      key,
      prefix: key.includes("*") ? key.split("*")[0] || "" : key,
      suffix: key.includes("*") ? key.split("*").slice(1).join("*") : "",
      hasWildcard: key.includes("*"),
      targets: (values || []).map((value) => path.resolve(targetRootAbs, value)),
    }))
    .sort((a, b) => {
      if (a.hasWildcard !== b.hasWildcard) {
        return a.hasWildcard ? 1 : -1;
      }
      return b.key.length - a.key.length;
    });
}

function loadTsconfigFromFile(tsconfigAbs: string, seen = new Set<string>()): LoadedTsconfig {
  const normalizedAbs = path.resolve(tsconfigAbs);
  if (seen.has(normalizedAbs) || !fs.existsSync(normalizedAbs)) {
    return { matchers: [] };
  }

  seen.add(normalizedAbs);
  const parsed = parseJsonLike(fs.readFileSync(normalizedAbs, "utf8"));
  const compilerOptions = parsed && typeof parsed === "object" && parsed.compilerOptions && typeof parsed.compilerOptions === "object"
    ? parsed.compilerOptions as { baseUrl?: string; paths?: BundlerTsconfigPaths }
    : {};
  const parentAbs = parsed && typeof parsed === "object" && typeof parsed.extends === "string"
    ? resolveTsconfigExtends(normalizedAbs, parsed.extends)
    : "";
  const inherited = parentAbs ? loadTsconfigFromFile(parentAbs, seen) : { matchers: [], baseUrlAbs: undefined };
  const baseUrlAbs = typeof compilerOptions.baseUrl === "string" && compilerOptions.baseUrl.trim()
    ? path.resolve(path.dirname(normalizedAbs), compilerOptions.baseUrl)
    : inherited.baseUrlAbs;
  const targetRootAbs = baseUrlAbs || path.dirname(normalizedAbs);

  return {
    baseUrlAbs,
    matchers: [
      ...inherited.matchers.filter((matcher) => !(compilerOptions.paths && Object.prototype.hasOwnProperty.call(compilerOptions.paths, matcher.key))),
      ...createTsconfigMatchers(compilerOptions.paths, targetRootAbs),
    ],
  };
}

function loadTsconfig(rootDir: string, tsconfig: BundlerImportGraphTsconfigOptions | undefined): LoadedTsconfig {
  if (tsconfig === false) {
    return { matchers: [] };
  }

  if (typeof tsconfig === "string") {
    return loadTsconfigFromFile(path.resolve(rootDir, tsconfig));
  }

  if (tsconfig && typeof tsconfig === "object") {
    const fileConfig = tsconfig.file
      ? loadTsconfigFromFile(path.resolve(rootDir, tsconfig.file))
      : { matchers: [], baseUrlAbs: undefined };
    const baseUrlAbs = typeof tsconfig.baseUrl === "string" && tsconfig.baseUrl.trim()
      ? path.resolve(rootDir, tsconfig.baseUrl)
      : fileConfig.baseUrlAbs;
    const targetRootAbs = baseUrlAbs || rootDir;

    return {
      baseUrlAbs,
      matchers: [
        ...fileConfig.matchers.filter((matcher) => !(tsconfig.paths && Object.prototype.hasOwnProperty.call(tsconfig.paths, matcher.key))),
        ...createTsconfigMatchers(tsconfig.paths, targetRootAbs),
      ],
    };
  }

  const defaultTsconfigAbs = path.resolve(rootDir, "tsconfig.json");
  if (!fs.existsSync(defaultTsconfigAbs)) {
    return { matchers: [] };
  }

  return loadTsconfigFromFile(defaultTsconfigAbs);
}

function resolveFileCandidate(baseAbs: string, extensions: string[]): string {
  const candidates = [
    baseAbs,
    ...extensions.map((extension) => `${baseAbs}${extension}`),
    ...extensions.map((extension) => path.join(baseAbs, `index${extension}`)),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      if (fs.statSync(candidate).isFile()) {
        return path.resolve(candidate);
      }
    } catch {}
  }

  return "";
}

function applyTsconfigMatcher(specifier: string, matcher: TsconfigPathMatcher): string[] {
  if (!matcher.hasWildcard) {
    return specifier === matcher.key ? matcher.targets.slice() : [];
  }

  if (!specifier.startsWith(matcher.prefix) || !specifier.endsWith(matcher.suffix)) {
    return [];
  }

  const wildcardValue = specifier.slice(matcher.prefix.length, specifier.length - matcher.suffix.length);
  return matcher.targets.map((target) => target.replace(/\*/g, wildcardValue));
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

  if (args.tsconfig.baseUrlAbs) {
    return resolveFileCandidate(path.resolve(args.tsconfig.baseUrlAbs, specifier), args.extensions);
  }

  return "";
}

function collectImports(source: string): BundlerImportGraphImport[] {
  const imports: BundlerImportGraphImport[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null = null;

  IMPORT_FROM_RE.lastIndex = 0;
  while ((match = IMPORT_FROM_RE.exec(source))) {
    const specifier = String(match[1] || "").trim();
    if (!specifier) continue;
    const key = `import:${specifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    imports.push({
      specifier,
      kind: "import",
      external: true,
    });
  }

  IMPORT_SIDE_EFFECT_RE.lastIndex = 0;
  while ((match = IMPORT_SIDE_EFFECT_RE.exec(source))) {
    const specifier = String(match[1] || "").trim();
    if (!specifier) continue;
    const key = `import:${specifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    imports.push({
      specifier,
      kind: "import",
      external: true,
    });
  }

  EXPORT_FROM_RE.lastIndex = 0;
  while ((match = EXPORT_FROM_RE.exec(source))) {
    const specifier = String(match[1] || "").trim();
    if (!specifier) continue;
    const key = `export-from:${specifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    imports.push({
      specifier,
      kind: "export-from",
      external: true,
    });
  }

  DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((match = DYNAMIC_IMPORT_RE.exec(source))) {
    const specifier = String(match[1] || "").trim();
    if (!specifier) continue;
    const key = `dynamic-import:${specifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    imports.push({
      specifier,
      kind: "dynamic-import",
      external: true,
    });
  }

  return imports;
}

async function walkImportGraph(options: BundlerImportGraphOptions): Promise<BundlerImportGraph> {
  const rootDir = path.resolve(String(options.rootDir || "").trim() || process.cwd());
  const extensions = (options.extensions && options.extensions.length ? options.extensions : DEFAULT_IMPORT_GRAPH_EXTENSIONS)
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .map((value) => value.startsWith(".") ? value : `.${value}`);
  const tsconfig = loadTsconfig(rootDir, options.tsconfig);
  const entryList = Array.isArray(options.entries) ? options.entries : [options.entries];
  const entryAbsList = entryList
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootDir, value));
  const files = new Map<string, BundlerImportGraphFile>();
  const visitedAbs = new Set<string>();

  const visit = (fileAbs: string): void => {
    const normalizedAbs = path.resolve(fileAbs);
    if (visitedAbs.has(normalizedAbs)) return;
    visitedAbs.add(normalizedAbs);
    if (!fs.existsSync(normalizedAbs)) return;
    if (!fs.statSync(normalizedAbs).isFile()) return;

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
      return {
        ...item,
        external: !resolved,
        resolved,
      };
    });
    const fileKey = normalizePathInRoot(rootDir, normalizedAbs);

    files.set(fileKey, {
      path: fileKey,
      imports,
    });

    for (const item of imports) {
      if (!item.resolved) continue;
      visit(path.resolve(rootDir, item.resolved));
    }
  };

  for (const entryAbs of entryAbsList) {
    visit(entryAbs);
  }

  return {
    entries: entryAbsList.map((value) => normalizePathInRoot(rootDir, value)),
    files: Object.fromEntries(Array.from(files.entries()).sort(([a], [b]) => a.localeCompare(b))),
  };
}

export { walkImportGraph };
