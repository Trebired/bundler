import fs from "node:fs/promises";
import path from "node:path";
import { toPosixPath } from "./discovery.js";
import { deriveManifest } from "./derive-manifest.js";
async function writeBundlerManifest(args) {
    if (!args.manifest.enabled || !args.manifest.file || !args.metafile) {
        return {};
    }
    const manifestPath = path.resolve(args.outDir, args.manifest.file);
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    const body = {
        generatedAt: new Date().toISOString(),
        resolvedEntries: Object.fromEntries(args.entries.map((entry) => [
            entry.name,
            {
                path: entry.source === "virtual"
                    ? `virtual:${entry.name}`
                    : toPosixPath(path.relative(args.rootDir, entry.path)),
                source: entry.source,
            },
        ])),
        ...deriveManifest(args.metafile, {
            outDir: args.outDir,
            rootDir: args.rootDir,
        }),
    };
    await fs.writeFile(`${manifestPath}`, `${JSON.stringify(body, null, 2)}\n`);
    return { manifestPath };
}
export { writeBundlerManifest };
//# sourceMappingURL=manifest.js.map