import type {
  BundlerImportGraphImport,
} from "#jb343639kom2";
import {
  DYNAMIC_IMPORT_RE,
  EXPORT_FROM_RE,
  IMPORT_FROM_RE,
  IMPORT_SIDE_EFFECT_RE,
} from "./shared.js";

function stripJsonComments(source: string): string {
  const state = createCommentStripState();
  let output = "";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    const result = advanceCommentStripState(state, char, next);
    output += result.output;
    index += result.skip;
  }

  return output;
}

function createCommentStripState() {
  return {
    escaping: false,
    inBlockComment: false,
    inLineComment: false,
    inString: false,
    quote: "",
  };
}

function advanceCommentStripState(
  state: ReturnType<typeof createCommentStripState>,
  char: string,
  next?: string,
): { output: string; skip: number } {
  if (state.inLineComment) return consumeLineComment(state, char);
  if (state.inBlockComment) return consumeBlockComment(state, char, next);
  if (state.inString) return consumeStringCharacter(state, char);
  if (char === "\"" || char === "'") return openString(state, char);
  if (char === "/" && next === "/") {
    state.inLineComment = true;
    return { output: "", skip: 1 };
  }
  if (char === "/" && next === "*") {
    state.inBlockComment = true;
    return { output: "", skip: 1 };
  }
  return { output: char, skip: 0 };
}

function consumeLineComment(
  state: ReturnType<typeof createCommentStripState>,
  char: string,
): { output: string; skip: number } {
  if (char === "\n") {
    state.inLineComment = false;
    return { output: char, skip: 0 };
  }
  return { output: "", skip: 0 };
}

function consumeBlockComment(
  state: ReturnType<typeof createCommentStripState>,
  char: string,
  next?: string,
): { output: string; skip: number } {
  if (char === "*" && next === "/") {
    state.inBlockComment = false;
    return { output: "", skip: 1 };
  }
  return { output: "", skip: 0 };
}

function consumeStringCharacter(
  state: ReturnType<typeof createCommentStripState>,
  char: string,
): { output: string; skip: number } {
  if (state.escaping) state.escaping = false;
  else if (char === "\\") state.escaping = true;
  else if (char === state.quote) {
    state.inString = false;
    state.quote = "";
  }
  return { output: char, skip: 0 };
}

function openString(
  state: ReturnType<typeof createCommentStripState>,
  char: string,
): { output: string; skip: number } {
  state.inString = true;
  state.quote = char;
  return { output: char, skip: 0 };
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
      if (escaping) escaping = false;
      else if (char === "\\") escaping = true;
      else if (char === quote) {
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
    if (char === "," && nextNonWhitespace(source, index + 1).match(/[}\]]/)) continue;
    output += char;
  }

  return output;
}

function parseJsonLike(text: string): any {
  return JSON.parse(stripTrailingCommas(stripJsonComments(text)));
}

function collectImports(source: string): BundlerImportGraphImport[] {
  const imports: BundlerImportGraphImport[] = [];
  const seen = new Set<string>();
  collectImportsByPattern(imports, seen, IMPORT_FROM_RE, source, "import");
  collectImportsByPattern(imports, seen, IMPORT_SIDE_EFFECT_RE, source, "import");
  collectImportsByPattern(imports, seen, EXPORT_FROM_RE, source, "export-from");
  collectImportsByPattern(imports, seen, DYNAMIC_IMPORT_RE, source, "dynamic-import");
  return imports;
}

function collectImportsByPattern(
  imports: BundlerImportGraphImport[],
  seen: Set<string>,
  pattern: RegExp,
  source: string,
  kind: BundlerImportGraphImport["kind"],
): void {
  let match: RegExpExecArray | null = null;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(source))) {
    const specifier = String(match[1] || "").trim();
    const key = `${kind}:${specifier}`;
    if (!specifier || seen.has(key)) continue;
    seen.add(key);
    imports.push({ specifier, kind, external: true });
  }
}

function nextNonWhitespace(source: string, index: number): string {
  let lookAhead = index;
  while (lookAhead < source.length && /\s/.test(source[lookAhead])) lookAhead += 1;
  return source[lookAhead] || "";
}

export {
  collectImports,
  parseJsonLike,
  stripJsonComments,
};
