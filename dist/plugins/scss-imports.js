import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const SCSS_ALIAS_SCHEME = "trebired-scss-alias:";
function readPackageImports(rootDir) {
    const packageJsonPath = path.join(rootDir, "package.json");
    if (!fs.existsSync(packageJsonPath))
        return {};
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return parsed.imports && typeof parsed.imports === "object" && !Array.isArray(parsed.imports)
        ? parsed.imports
        : {};
}
function resolveImportTarget(value) {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value)) {
        for (const entry of value) {
            const resolved = resolveImportTarget(entry);
            if (resolved)
                return resolved;
        }
    }
    if (value && typeof value === "object") {
        const record = value;
        for (const condition of ["sass", "style", "import", "default"]) {
            const resolved = resolveImportTarget(record[condition]);
            if (resolved)
                return resolved;
        }
    }
    return "";
}
function buildSassFileCandidates(candidatePath) {
    const candidates = [];
    const extension = path.extname(candidatePath).toLowerCase();
    const dirname = path.dirname(candidatePath);
    const basename = path.basename(candidatePath);
    const partialPath = path.join(dirname, `_${basename}`);
    if (extension) {
        candidates.push(candidatePath, path.join(dirname, `_${basename}`));
        return candidates;
    }
    candidates.push(`${candidatePath}.sass`, `${candidatePath}.scss`, `${partialPath}.sass`, `${partialPath}.scss`, path.join(candidatePath, "index.sass"), path.join(candidatePath, "index.scss"), path.join(candidatePath, "_index.sass"), path.join(candidatePath, "_index.scss"));
    return candidates;
}
function resolveSassFileCandidate(candidatePath) {
    const matches = buildSassFileCandidates(candidatePath).filter((candidate) => {
        try {
            return fs.statSync(candidate).isFile();
        }
        catch {
            return false;
        }
    });
    if (matches.length > 1) {
        throw new Error(`Ambiguous Sass import: ${candidatePath}`);
    }
    return matches[0] ? path.resolve(matches[0]) : "";
}
function toAliasUrl(specifier) {
    return `${SCSS_ALIAS_SCHEME}${encodeURIComponent(specifier.slice(1))}`;
}
function fromAliasUrl(url) {
    if (!url.startsWith(SCSS_ALIAS_SCHEME))
        return "";
    return `#${decodeURIComponent(url.slice(SCSS_ALIAS_SCHEME.length))}`;
}
function resolveAliasFilePath(context, specifier) {
    if (!specifier.startsWith("#"))
        return "";
    const target = resolveImportTarget(context.importsMap[specifier]);
    if (!target || !target.startsWith("./"))
        return "";
    return resolveSassFileCandidate(path.resolve(context.rootDir, target));
}
function isIdentifierCharacter(value) {
    return /[a-zA-Z0-9_-]/.test(value);
}
function matchSassDirective(text, index) {
    if (text[index] !== "@")
        return "";
    for (const directive of ["forward", "import", "use"]) {
        const start = index + 1;
        const end = start + directive.length;
        if (text.slice(start, end) === directive && !isIdentifierCharacter(text[end] || ""))
            return directive;
    }
    return "";
}
function findDirectiveEnd(text, index) {
    let quote = "";
    let escaping = false;
    let parenDepth = 0;
    for (let cursor = index; cursor < text.length; cursor += 1) {
        const char = text[cursor];
        if (quote) {
            if (escaping)
                escaping = false;
            else if (char === "\\")
                escaping = true;
            else if (char === quote)
                quote = "";
            continue;
        }
        if (char === "\"" || char === "'") {
            quote = char;
            continue;
        }
        if (char === "(")
            parenDepth += 1;
        else if (char === ")" && parenDepth > 0)
            parenDepth -= 1;
        else if (char === ";" && parenDepth === 0)
            return cursor;
    }
    return text.length;
}
function isInsideUrlFunction(segment, quoteIndex) {
    let cursor = quoteIndex - 1;
    while (cursor >= 0 && /\s/.test(segment[cursor]))
        cursor -= 1;
    if (segment[cursor] !== "(")
        return false;
    cursor -= 1;
    while (cursor >= 0 && /\s/.test(segment[cursor]))
        cursor -= 1;
    const end = cursor + 1;
    while (cursor >= 0 && /[a-zA-Z-]/.test(segment[cursor]))
        cursor -= 1;
    return segment.slice(cursor + 1, end).toLowerCase() === "url";
}
function collectQuotedSpecifiers(segment, baseOffset) {
    const occurrences = [];
    let quote = "";
    let specifierStart = -1;
    let escaping = false;
    for (let index = 0; index < segment.length; index += 1) {
        const char = segment[index];
        if (quote) {
            if (escaping)
                escaping = false;
            else if (char === "\\")
                escaping = true;
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
function createTextScannerState() {
    return {
        escaping: false,
        inBlockComment: false,
        inLineComment: false,
        inString: false,
        quote: "",
    };
}
function advanceTextScannerState(state, char, next) {
    if (state.inLineComment) {
        if (char === "\n" || char === "\r")
            state.inLineComment = false;
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
        if (state.escaping)
            state.escaping = false;
        else if (char === "\\")
            state.escaping = true;
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
function collectDirectiveSpecifiers(text, directive, index) {
    const directiveEnd = findDirectiveEnd(text, index);
    const directiveStart = index + directive.length + 1;
    const specifiers = collectQuotedSpecifiers(text.slice(directiveStart, directiveEnd), directiveStart);
    return {
        nextIndex: directiveEnd,
        occurrences: directive === "import" ? specifiers : specifiers.slice(0, 1),
    };
}
function collectScssSpecifiers(text) {
    const occurrences = [];
    const state = createTextScannerState();
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
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
function rewriteScssAliasDirectives(text) {
    const replacements = collectScssSpecifiers(text)
        .filter((occurrence) => occurrence.specifier.startsWith("#"))
        .sort((left, right) => right.start - left.start);
    let nextText = text;
    for (const replacement of replacements) {
        nextText = `${nextText.slice(0, replacement.start)}${toAliasUrl(replacement.specifier)}${nextText.slice(replacement.end)}`;
    }
    return nextText;
}
function inferSyntax(filePath) {
    return path.extname(filePath).toLowerCase() === ".sass" ? "indented" : "scss";
}
function resolveCanonicalFilePath(url, context) {
    const alias = fromAliasUrl(url);
    if (alias)
        return resolveAliasFilePath(context, alias);
    if (url.startsWith("file:")) {
        return resolveSassFileCandidate(fileURLToPath(new URL(url)));
    }
    return "";
}
function createScssAliasImporter(rootDir) {
    const importsMap = readPackageImports(rootDir);
    const context = { importsMap, rootDir };
    return {
        canonicalize(url) {
            const resolvedFile = resolveCanonicalFilePath(String(url || "").trim(), context);
            return resolvedFile ? pathToFileURL(resolvedFile) : null;
        },
        load(canonicalUrl) {
            if (canonicalUrl.protocol !== "file:")
                return null;
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
//# sourceMappingURL=scss-imports.js.map