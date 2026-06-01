import fs from "node:fs/promises";
import path from "node:path";
import type { Metafile } from "esbuild";

import type { BundlerEntryRecord } from "../types.js";
import { toPosixPath } from "./discovery.js";
import type { NormalizedManifestOptions } from "./discovery.js";
import { deriveManifest } from "./derive-manifest.js";

type ManifestWriteResult = {
  manifestPath?: string;
};

async function writeBundlerManifest(args: {
  entries: BundlerEntryRecord[];
  metafile?: Metafile;
  manifest: NormalizedManifestOptions;
  outDir: string;
  rootDir: string;
}): Promise<ManifestWriteResult> {
  if (!args.manifest.enabled || !args.manifest.file || !args.metafile) {
    return {};
  }

  const manifestPath = path.resolve(args.outDir, args.manifest.file);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });

  const body = {
    generatedAt: new Date().toISOString(),
    resolvedEntries: Object.fromEntries(
      args.entries.map((entry) => [
        entry.name,
        {
          path: entry.source === "virtual"
            ? `virtual:${entry.name}`
            : toPosixPath(path.relative(args.rootDir, entry.path)),
          source: entry.source,
        },
      ]),
    ),
    ...deriveManifest(args.metafile, {
      outDir: args.outDir,
      rootDir: args.rootDir,
    }),
  };

  await fs.writeFile(`${manifestPath}`, `${JSON.stringify(body, null, 2)}\n`);

  return { manifestPath };
}

export { writeBundlerManifest };
