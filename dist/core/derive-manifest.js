import path from "node:path";
import { VIRTUAL_ENTRY_NAMESPACE } from "../plugins/virtual-entries.js";
import { toPosixPath } from "./discovery.js";
import { VIRTUAL_ENTRY_PREFIX } from "./discovery.js";
function normalizeFilePath(filePath, rootDir) {
    if (filePath.startsWith(VIRTUAL_ENTRY_PREFIX)) {
        return `virtual:${filePath.slice(VIRTUAL_ENTRY_PREFIX.length)}`;
    }
    if (filePath.startsWith(`${VIRTUAL_ENTRY_NAMESPACE}:`)) {
        return `virtual:${filePath.slice(VIRTUAL_ENTRY_NAMESPACE.length + 1)}`;
    }
    const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);
    return toPosixPath(path.relative(rootDir, absolute));
}
function normalizeInputPaths(inputs, rootDir) {
    return Object.keys(inputs)
        .map((value) => normalizeFilePath(value, rootDir))
        .sort();
}
function normalizeImportedOutputPaths(metafile, outputPath, rootDir) {
    const output = metafile.outputs[outputPath];
    if (!output)
        return [];
    return output.imports
        .filter((item) => !item.external && Boolean(metafile.outputs[item.path]))
        .map((item) => normalizeFilePath(item.path, rootDir))
        .sort();
}
function resolveOutputKind(args) {
    if (args.outputValue.entryPoint)
        return "entry";
    if (args.importedOutputs.has(args.outputRel) || /\.(?:[mc]?js)$/i.test(args.outputRel))
        return "chunk";
    return "asset";
}
function deriveEntryName(args) {
    if (args.outputValue.entryPoint) {
        const entryRel = normalizeFilePath(args.outputValue.entryPoint, args.rootDir);
        const ext = path.extname(entryRel);
        return toPosixPath(ext ? entryRel.slice(0, -ext.length) : entryRel);
    }
    const absoluteOutDir = path.resolve(args.rootDir, args.outDir);
    const absoluteOutput = path.resolve(args.rootDir, args.entryOutput);
    const relOut = toPosixPath(path.relative(absoluteOutDir, absoluteOutput));
    if (!relOut || relOut.startsWith(".."))
        return undefined;
    const ext = path.extname(relOut);
    return ext ? relOut.slice(0, -ext.length) : relOut;
}
function collectReachableOutputs(args) {
    const seen = new Set();
    const stack = [args.outputPath];
    while (stack.length) {
        const current = stack.pop();
        if (seen.has(current))
            continue;
        seen.add(current);
        const currentOutput = args.metafile.outputs[current];
        if (!currentOutput)
            continue;
        for (const imported of currentOutput.imports) {
            if (imported.external || !args.metafile.outputs[imported.path])
                continue;
            stack.push(imported.path);
        }
    }
    return Array.from(seen).sort().map((value) => normalizeFilePath(value, args.rootDir));
}
function deriveManifest(metafile, options) {
    const outputs = Object.entries(metafile.outputs).sort(([a], [b]) => a.localeCompare(b));
    const importedOutputs = new Set();
    for (const [, output] of outputs) {
        for (const imported of output.imports) {
            if (!imported.external && metafile.outputs[imported.path]) {
                importedOutputs.add(normalizeFilePath(imported.path, options.rootDir));
            }
        }
    }
    const entries = {};
    const chunks = {};
    const allOutputs = {};
    for (const [outputPath, outputValue] of outputs) {
        const outputRel = normalizeFilePath(outputPath, options.rootDir);
        const imports = normalizeImportedOutputPaths(metafile, outputPath, options.rootDir);
        const css = outputValue.cssBundle
            ? [normalizeFilePath(outputValue.cssBundle, options.rootDir)]
            : outputRel.endsWith(".css")
                ? [outputRel]
                : [];
        const outputInfo = {
            output: outputRel,
            kind: resolveOutputKind({
                importedOutputs,
                outputPath,
                outputRel,
                outputValue,
            }),
            entryPoint: outputValue.entryPoint ? normalizeFilePath(outputValue.entryPoint, options.rootDir) : undefined,
            entryName: deriveEntryName({
                entryOutput: outputPath,
                outputValue,
                outDir: options.outDir,
                rootDir: options.rootDir,
            }),
            inputs: normalizeInputPaths(outputValue.inputs, options.rootDir),
            css,
            imports,
            bytes: outputValue.bytes,
        };
        allOutputs[outputRel] = outputInfo;
    }
    for (const [outputPath] of outputs) {
        const outputRel = normalizeFilePath(outputPath, options.rootDir);
        const outputInfo = allOutputs[outputRel];
        if (!outputInfo)
            continue;
        if (outputInfo.kind === "entry") {
            const reachable = collectReachableOutputs({
                metafile,
                outputPath,
                rootDir: options.rootDir,
            });
            const js = reachable.filter((value) => /\.(?:[mc]?js)$/i.test(value));
            const reachableCss = Array.from(new Set(reachable.flatMap((value) => {
                const info = allOutputs[value];
                return info ? info.css : value.endsWith(".css") ? [value] : [];
            }))).sort();
            entries[outputRel] = {
                entryOutput: outputRel,
                entryName: outputInfo.entryName,
                inputs: outputInfo.inputs,
                js,
                css: reachableCss,
                imports: outputInfo.imports,
            };
            continue;
        }
        if (outputInfo.kind === "chunk") {
            chunks[outputRel] = {
                output: outputRel,
                inputs: outputInfo.inputs,
                css: outputInfo.css,
                imports: outputInfo.imports,
            };
        }
    }
    return {
        entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))),
        chunks: Object.fromEntries(Object.entries(chunks).sort(([a], [b]) => a.localeCompare(b))),
        allOutputs: Object.fromEntries(Object.entries(allOutputs).sort(([a], [b]) => a.localeCompare(b))),
    };
}
export { deriveManifest };
//# sourceMappingURL=derive-manifest.js.map