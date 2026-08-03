import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Importer, Syntax } from "sass-embedded";
import { resolvePackageFilePath } from "./package-resolution.js";
const SCSS_ALIAS_SCHEME = "package-scss-alias:";
type ScssSpecifierOccurrence = {
  end: number;
  specifier: string;
  start: number;
};
type TextScannerState = {
  escaping: boolean;
  inBlockComment: boolean;
  inLineComment: boolean;
  inString: boolean;
  quote: string;
};
type PackageJson = {
  imports?: Record<string, unknown>;
};
type ScssImportContext = {
  importsMap: Record<string, unknown>;
  rootDir: string;
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function readPackageImports(rootDir: string): Record<string, unknown> {
  const packageJsonPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) return {};
  const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJson;
  return isRecord(parsed.imports) ? parsed.imports : {};
}
function normalizeDotPrefixedTarget(target: string): string {
  return target.startsWith("./") ? target : `./${target}`;
}
function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  return isRecord(parsed) ? parsed : {};
}
function readGeneratedTsconfigImports(rootDir: string): Record<string, unknown> {
  const generatedTsconfigPath = path.join(rootDir, ".trebired", "code-discipline", "generated", "tsconfig.paths.json");
  if (!fs.existsSync(generatedTsconfigPath)) return {};
  const parsed = readJsonObject(generatedTsconfigPath);
  const compilerOptions = isRecord(parsed.compilerOptions) ? parsed.compilerOptions : {};
  const paths = isRecord(compilerOptions.paths) ? compilerOptions.paths : {};
  const importsMap: Record<string, string> = {};
  for (const [aliasId, targets] of Object.entries(paths)) {
    const firstTarget = Array.isArray(targets) ? targets[0] : "";
    if (typeof firstTarget !== "string") continue;
    const resolved = path.resolve(path.dirname(generatedTsconfigPath), firstTarget);
    importsMap[aliasId] = normalizeDotPrefixedTarget(toPosixPath(path.relative(rootDir, resolved)));
  }
  return importsMap;
}
function readCodeDisciplineFolderImports(rootDir: string): Record<string, unknown> {
  const importsDir = path.join(rootDir, ".trebired", "code-discipline", "imports");
  if (!fs.existsSync(importsDir)) return {};
  const importsMap: Record<string, string> = {};
  const entries = fs.readdirSync(importsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  for (const filename of entries) {
    const parsed = readJsonObject(path.join(importsDir, filename));
    for (const [aliasId, target] of Object.entries(parsed)) {
      if (typeof target === "string" && !(aliasId in importsMap)) {
        importsMap[aliasId] = normalizeDotPrefixedTarget(target);
      }
    }
  }
  return importsMap;
}
function readAliasImports(rootDir: string): Record<string, unknown> {
  return {
    ...readPackageImports(rootDir),
    ...readGeneratedTsconfigImports(rootDir),
    ...readCodeDisciplineFolderImports(rootDir),
  };
}
function resolveImportTarget(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const resolved = resolveImportTarget(entry);
      if (resolved) return resolved;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const condition of ["sass", "style", "import", "default"]) {
      const resolved = resolveImportTarget(record[condition]);
      if (resolved) return resolved;
    }
  }
  return "";
}
function buildSassFileCandidates(candidatePath: string): string[] {
  const candidates: string[] = [];
  const extension = path.extname(candidatePath).toLowerCase();
  const dirname = path.dirname(candidatePath);
  const basename = path.basename(candidatePath);
  const partialPath = path.join(dirname, `_${basename}`);
  if (extension) {
    candidates.push(candidatePath, path.join(dirname, `_${basename}`));
    return candidates;
  }
  candidates.push(
    `${candidatePath}.sass`,
    `${candidatePath}.scss`,
    `${partialPath}.sass`,
    `${partialPath}.scss`,
    path.join(candidatePath, "index.sass"),
    path.join(candidatePath, "index.scss"),
    path.join(candidatePath, "_index.sass"),
    path.join(candidatePath, "_index.scss"),
  );
  return candidates;
}
function resolveSassFileCandidate(candidatePath: string): string {
  const matches = buildSassFileCandidates(candidatePath).filter((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (matches.length > 1) {
    throw new Error(`Ambiguous Sass import: ${candidatePath}`);
  }
  return matches[0] ? path.resolve(matches[0]) : "";
}
function toAliasUrl(specifier: string): string {
  return `${SCSS_ALIAS_SCHEME}${encodeURIComponent(specifier.slice(1))}`;
}
function fromAliasUrl(url: string): string {
  if (!url.startsWith(SCSS_ALIAS_SCHEME)) return "";
  return `#${decodeURIComponent(url.slice(SCSS_ALIAS_SCHEME.length))}`;
}
function resolveAliasFilePath(context: ScssImportContext, specifier: string): string {
  if (!specifier.startsWith("#")) return "";
  const target = resolveImportTarget(context.importsMap[specifier]);
  if (!target || !target.startsWith("./")) return "";
  return resolveSassFileCandidate(path.resolve(context.rootDir, target));
}
function isIdentifierCharacter(value: string): boolean {
  return /[a-zA-Z0-9_-]/.test(value);
}
function matchSassDirective(text: string, index: number): "forward" | "import" | "use" | "" {
  if (text[index] !== "@") return "";
  for (const directive of ["forward", "import", "use"] as const) {
    const start = index + 1;
    const end = start + directive.length;
    if (text.slice(start, end) === directive && !isIdentifierCharacter(text[end] || "")) return directive;
  }
  return "";
}
function findDirectiveEnd(text: string, index: number): number {
  let quote = "";
  let escaping = false;
  let parenDepth = 0;
  for (let cursor = index; cursor < text.length; cursor += 1) {
    const char = text[cursor]!;
    if (quote) {
      if (escaping) escaping = false;
      else if (char === "\\") escaping = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") parenDepth += 1;
    else if (char === ")" && parenDepth > 0) parenDepth -= 1;
    else if (char === ";" && parenDepth === 0) return cursor;
  }
  return text.length;
}
function isInsideUrlFunction(segment: string, quoteIndex: number): boolean {
  let cursor = quoteIndex - 1;
  while (cursor >= 0 && /\s/.test(segment[cursor]!)) cursor -= 1;
  if (segment[cursor] !== "(") return false;
  cursor -= 1;
  while (cursor >= 0 && /\s/.test(segment[cursor]!)) cursor -= 1;
  const end = cursor + 1;
  while (cursor >= 0 && /[a-zA-Z-]/.test(segment[cursor]!)) cursor -= 1;
  return segment.slice(cursor + 1, end).toLowerCase() === "url";
}
function collectQuotedSpecifiers(segment: string, baseOffset: number): ScssSpecifierOccurrence[] {
  const occurrences: ScssSpecifierOccurrence[] = [];
  let quote = "";
  let specifierStart = -1;
  let escaping = false;
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index]!;
    if (quote) {
      if (escaping) escaping = false;
      else if (char === "\\") escaping = true;
      else if (char === quote) {
        occurrences.push({
          end: baseOffset + index,
          specifier: segment.slice(specifierStart, index),
          start: baseOffset + specifierStart,
        });
        quote = "";
        specifierStart = -1;
      }
      continue;
    }
    if ((char === "\"" || char === "'") && !isInsideUrlFunction(segment, index)) {
      quote = char;
      specifierStart = index + 1;
    }
  }
  return occurrences;
}
function createTextScannerState(): TextScannerState {
  return {
    escaping: false,
    inBlockComment: false,
    inLineComment: false,
    inString: false,
    quote: "",
  };
}
function advanceTextScannerState(state: TextScannerState, char: string, next?: string): { skip: number } {
  if (state.inLineComment) {
    if (char === "\n" || char === "\r") state.inLineComment = false;
    return { skip: 0 };
  }
  if (state.inBlockComment) {
    if (char === "*" && next === "/") {
      state.inBlockComment = false;
      return { skip: 1 };
    }
    return { skip: 0 };
  }
  if (state.inString) {
    if (state.escaping) state.escaping = false;
    else if (char === "\\") state.escaping = true;
    else if (char === state.quote) {
      state.inString = false;
      state.quote = "";
    }
    return { skip: 0 };
  }
  if (char === "/" && next === "/") {
    state.inLineComment = true;
    return { skip: 1 };
  }
  if (char === "/" && next === "*") {
    state.inBlockComment = true;
    return { skip: 1 };
  }
  if (char === "\"" || char === "'") {
    state.inString = true;
    state.quote = char;
  }
  return { skip: 0 };
}
function collectDirectiveSpecifiers(text: string, directive: "forward" | "import" | "use", index: number): {
  nextIndex: number;
  occurrences: ScssSpecifierOccurrence[];
} {
  const directiveEnd = findDirectiveEnd(text, index);
  const directiveStart = index + directive.length + 1;
  const specifiers = collectQuotedSpecifiers(text.slice(directiveStart, directiveEnd), directiveStart);
  return {
    nextIndex: directiveEnd,
    occurrences: directive === "import" ? specifiers : specifiers.slice(0, 1),
  };
}
function collectScssSpecifiers(text: string): ScssSpecifierOccurrence[] {
  const occurrences: ScssSpecifierOccurrence[] = [];
  const state = createTextScannerState();
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const next = text[index + 1];
    if (!state.inLineComment && !state.inBlockComment && !state.inString) {
      const directive = matchSassDirective(text, index);
      if (directive) {
        const result = collectDirectiveSpecifiers(text, directive, index);
        occurrences.push(...result.occurrences);
        index = result.nextIndex;
        continue;
      }
    }
    index += advanceTextScannerState(state, char, next).skip;
  }
  return occurrences;
}
function rewriteScssAliasDirectives(text: string): string {
  const replacements = collectScssSpecifiers(text)
    .filter((occurrence) => occurrence.specifier.startsWith("#"))
    .sort((left, right) => right.start - left.start);
  let nextText = text;
  for (const replacement of replacements) {
    nextText = `${nextText.slice(0, replacement.start)}${toAliasUrl(replacement.specifier)}${nextText.slice(replacement.end)}`;
  }
  return nextText;
}
function inferSyntax(filePath: string): Syntax {
  return path.extname(filePath).toLowerCase() === ".sass" ? "indented" : "scss";
}
function resolveCanonicalFilePath(url: string, context: ScssImportContext): string {
  const alias = fromAliasUrl(url);
  if (alias) return resolveAliasFilePath(context, alias);
  if (url.startsWith("file:")) {
    return resolveSassFileCandidate(fileURLToPath(new URL(url)));
  }
  const packageFile = resolvePackageFilePath({
    resolveSassFileCandidate,
    rootDir: context.rootDir,
  }, url);
  if (packageFile) return packageFile;
  return "";
}
function createScssAliasImporter(rootDir: string): Importer<"async"> {
  const importsMap = readAliasImports(rootDir);
  const context = { importsMap, rootDir };
  return {
    canonicalize(url) {
      const resolvedFile = resolveCanonicalFilePath(String(url || "").trim(), context);
      return resolvedFile ? pathToFileURL(resolvedFile) : null;
    },
    load(canonicalUrl) {
      if (canonicalUrl.protocol !== "file:") return null;
      const filePath = fileURLToPath(canonicalUrl);
      return {
        contents: rewriteScssAliasDirectives(fs.readFileSync(filePath, "utf8")),
        sourceMapUrl: canonicalUrl,
        syntax: inferSyntax(filePath),
      };
    },
  };
}
export { createScssAliasImporter, rewriteScssAliasDirectives };
