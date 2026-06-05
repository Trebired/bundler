import path from "node:path";
import { deriveManifest } from "./derive-manifest.js";
import { toPosixPath } from "./discovery.js";
function normalizeKey(value) {
    return toPosixPath(String(value || "").trim()).replace(/^\.\/+/, "").replace(/^\/+|\/+$/g, "");
}
function normalizeSourcePath(value, rootDir) {
    const raw = String(value || "").trim();
    if (!raw)
        return "";
    if (raw.startsWith("virtual:"))
        return normalizeKey(raw);
    const absolute = path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw);
    return normalizeKey(path.relative(rootDir, absolute));
}
function normalizeOutputPath(value, rootDir, outDir) {
    const raw = String(value || "").trim();
    if (!raw)
        return "";
    if (path.isAbsolute(raw)) {
        return normalizeKey(path.relative(outDir, raw));
    }
    const normalized = normalizeKey(raw);
    if (!normalized)
        return "";
    const outDirRel = normalizeKey(path.relative(rootDir, outDir));
    if (outDirRel && normalized.startsWith(`${outDirRel}/`)) {
        return normalized.slice(outDirRel.length + 1);
    }
    return normalized;
}
function toStableList(values) {
    return Array.from(new Set(Array.from(values).filter(Boolean)));
}
function normalizeResolvedEntries(resolvedEntries, rootDir) {
    const out = new Map();
    if (!resolvedEntries)
        return out;
    if (Array.isArray(resolvedEntries)) {
        for (const entry of resolvedEntries) {
            const entryKey = entry.source === "virtual"
                ? `virtual:${normalizeKey(entry.name)}`
                : normalizeSourcePath(entry.path, rootDir);
            if (!entryKey || !entry.name)
                continue;
            out.set(entryKey, entry.name);
        }
        return out;
    }
    for (const [entryName, entryPath] of Object.entries(resolvedEntries)) {
        const entryKey = normalizeSourcePath(entryPath, rootDir);
        if (!entryKey || !entryName)
            continue;
        out.set(entryKey, normalizeKey(entryName));
    }
    return out;
}
function collectReachableOutputs(args) {
    const seen = new Set();
    const stack = [args.entryOutput];
    while (stack.length) {
        const current = stack.pop();
        if (!current || seen.has(current))
            continue;
        seen.add(current);
        const output = args.outputs[current];
        if (!output)
            continue;
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
function createEntryRecord(args) {
    const js = toStableList(args.js);
    const css = toStableList(args.css);
    const outputs = toStableList(args.outputs);
    const jsSet = new Set(js);
    const cssSet = new Set(css);
    return {
        entryName: args.entryName,
        entrySource: args.entrySource,
        file: args.entryOutput,
        entryOutput: args.entryOutput,
        outputs,
        js,
        css,
        assets: outputs.filter((value) => !jsSet.has(value) && !cssSet.has(value)),
        imports: toStableList(args.imports),
    };
}
function buildAssetManifest(options) {
    const rootDir = path.resolve(options.rootDir);
    const outDir = path.resolve(rootDir, options.outDir);
    const derived = deriveManifest(options.metafile, {
        outDir,
        rootDir,
    });
    const resolvedEntryNames = normalizeResolvedEntries(options.resolvedEntries, rootDir);
    const entries = {};
    const entryNames = {};
    const entrySources = {};
    const entryOutputs = {};
    const outputs = {};
    for (const output of Object.values(derived.allOutputs)) {
        const entrySource = output.entryPoint
            ? normalizeSourcePath(output.entryPoint, rootDir)
            : undefined;
        const entryName = entrySource
            ? resolvedEntryNames.get(entrySource) || output.entryName
            : output.entryName;
        const outputKey = normalizeOutputPath(output.output, rootDir, outDir);
        if (!outputKey)
            continue;
        outputs[outputKey] = {
            output: outputKey,
            kind: output.kind,
            entryName,
            entrySource,
            entryPoint: entrySource,
            inputs: output.inputs.map((value) => normalizeSourcePath(value, rootDir)).filter(Boolean),
            css: output.css.map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean),
            imports: output.imports.map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean),
            bytes: output.bytes,
        };
    }
    for (const entry of Object.values(derived.entries)) {
        const outputInfo = derived.allOutputs[entry.entryOutput];
        const entrySource = outputInfo?.entryPoint
            ? normalizeSourcePath(outputInfo.entryPoint, rootDir)
            : undefined;
        const entryName = entrySource
            ? resolvedEntryNames.get(entrySource) || outputInfo?.entryName || entry.entryName
            : outputInfo?.entryName || entry.entryName;
        const entryKey = entrySource || normalizeOutputPath(entry.entryOutput, rootDir, outDir);
        const entryOutput = normalizeOutputPath(entry.entryOutput, rootDir, outDir);
        const reachableOutputs = collectReachableOutputs({
            entryOutput: entry.entryOutput,
            outputs: derived.allOutputs,
        }).map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean);
        if (!entryKey || !entryOutput)
            continue;
        entries[entryKey] = createEntryRecord({
            entryName,
            entryOutput,
            entrySource,
            outputs: reachableOutputs,
            js: entry.js.map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean),
            css: entry.css.map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean),
            imports: entry.imports.map((value) => normalizeOutputPath(value, rootDir, outDir)).filter(Boolean),
        });
        if (entryName) {
            entryNames[entryName] = entryKey;
        }
        if (entrySource) {
            entrySources[entrySource] = entryKey;
        }
        entryOutputs[entryOutput] = entryKey;
    }
    return {
        entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))),
        entryNames: Object.fromEntries(Object.entries(entryNames).sort(([a], [b]) => a.localeCompare(b))),
        entrySources: Object.fromEntries(Object.entries(entrySources).sort(([a], [b]) => a.localeCompare(b))),
        entryOutputs: Object.fromEntries(Object.entries(entryOutputs).sort(([a], [b]) => a.localeCompare(b))),
        outputs: Object.fromEntries(Object.entries(outputs).sort(([a], [b]) => a.localeCompare(b))),
    };
}
function toPublicPath(publicPath, value) {
    const normalizedValue = normalizeKey(value);
    const base = String(publicPath || "").trim();
    if (!base)
        return normalizedValue;
    if (base === "/")
        return normalizedValue ? `/${normalizedValue}` : "/";
    return `${base.replace(/\/+$/g, "")}/${normalizedValue.replace(/^\/+/g, "")}`;
}
function resolveEntryKey(manifest, entryId, from) {
    const normalizedId = normalizeKey(entryId);
    if (!normalizedId)
        return "";
    if (from === "entryKey") {
        return manifest.entries[normalizedId] ? normalizedId : "";
    }
    if (from === "entryName") {
        return manifest.entryNames[normalizedId] || "";
    }
    if (from === "entrySource") {
        return manifest.entrySources[normalizedId] || "";
    }
    if (from === "entryOutput") {
        return manifest.entryOutputs[normalizedId] || "";
    }
    return manifest.entries[normalizedId]
        ? normalizedId
        : manifest.entryNames[normalizedId]
            || manifest.entrySources[normalizedId]
            || manifest.entryOutputs[normalizedId]
            || "";
}
function collectAssetLinks(manifest, entryIds, options = {}) {
    const from = options.from || "auto";
    const publicPath = options.publicPath;
    const entryKeys = [];
    const missing = [];
    const scripts = new Set();
    const styles = new Set();
    const assets = new Set();
    const outputs = new Set();
    const seenKeys = new Set();
    for (const entryId of entryIds || []) {
        const entryKey = resolveEntryKey(manifest, entryId, from);
        if (!entryKey) {
            const normalizedId = normalizeKey(entryId);
            if (normalizedId && !missing.includes(normalizedId)) {
                missing.push(normalizedId);
            }
            continue;
        }
        if (seenKeys.has(entryKey))
            continue;
        seenKeys.add(entryKey);
        entryKeys.push(entryKey);
        const entry = manifest.entries[entryKey];
        if (!entry)
            continue;
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
//# sourceMappingURL=asset-manifest.js.map