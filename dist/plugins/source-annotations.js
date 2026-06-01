import fs from "node:fs/promises";
import path from "node:path";
function toPosixPath(value) {
    return value.replace(/\\/g, "/");
}
function resolveSourceLabel(filePath, rootDir) {
    return toPosixPath(path.relative(rootDir, filePath) || path.basename(filePath));
}
function buildSourceAnnotation(filePath, rootDir) {
    return `/*! @trebired/source: ${resolveSourceLabel(filePath, rootDir)} */`;
}
function insertAfterShebang(contents, annotation) {
    const newlineIndex = contents.indexOf("\n");
    if (newlineIndex === -1)
        return `${contents}\n${annotation}\n`;
    return `${contents.slice(0, newlineIndex + 1)}${annotation}\n${contents.slice(newlineIndex + 1)}`;
}
function insertAfterCharset(contents, annotation) {
    const charsetMatch = contents.match(/^(@charset\s+(?:"[^"]*"|'[^']*');\s*)/i);
    if (!charsetMatch)
        return `${annotation}\n${contents}`;
    const prefix = charsetMatch[1];
    return `${prefix}${annotation}\n${contents.slice(prefix.length)}`;
}
function injectSourceAnnotation(args) {
    const annotation = buildSourceAnnotation(args.filePath, args.rootDir);
    if (args.kind === "css") {
        return insertAfterCharset(args.contents, annotation);
    }
    if (args.contents.startsWith("#!")) {
        return insertAfterShebang(args.contents, annotation);
    }
    return `${annotation}\n${args.contents}`;
}
function resolveLoader(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".css")
        return "css";
    if (ext === ".tsx")
        return "tsx";
    if (ext === ".jsx")
        return "jsx";
    if (ext === ".ts" || ext === ".mts" || ext === ".cts")
        return "ts";
    return "js";
}
function createSourceAnnotationsPlugin(options) {
    return {
        name: "trebired-source-annotations",
        setup(build) {
            build.onLoad({ filter: /\.(?:[mc]?js|[mc]?ts|jsx|tsx|css)$/ }, async (args) => {
                try {
                    const original = await fs.readFile(args.path, "utf8");
                    const kind = path.extname(args.path).toLowerCase() === ".css" ? "css" : "code";
                    const contents = injectSourceAnnotation({
                        contents: original,
                        filePath: args.path,
                        kind,
                        rootDir: options.rootDir,
                    });
                    return {
                        contents,
                        loader: resolveLoader(args.path),
                        watchFiles: [args.path],
                    };
                }
                catch (error) {
                    options.logger.error("annotate", `load-failed :: ${args.path}`, {
                        error: error instanceof Error ? error.message : String(error),
                    });
                    throw error;
                }
            });
        },
    };
}
export { buildSourceAnnotation, createSourceAnnotationsPlugin, injectSourceAnnotation, resolveSourceLabel };
//# sourceMappingURL=source-annotations.js.map