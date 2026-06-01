import fs from "node:fs/promises";
import path from "node:path";

import type { BundlerEntryRecord } from "../types.js";
import { toPosixPath } from "./discovery.js";
import type { NormalizedManifestOptions } from "./discovery.js";

type ManifestWriteResult = {
  manifestPath?: string;
};

async function writeBundlerManifest(args: {
  entries: BundlerEntryRecord[];
  manifest: NormalizedManifestOptions;
  outDir: string;
  outputs: string[];
  rootDir: string;
}): Promise<ManifestWriteResult> {
  if (!args.manifest.enabled || !args.manifest.file) {
    return {};
  }

  const manifestPath = path.resolve(args.outDir, args.manifest.file);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });

  const body = {
    generatedAt: new Date().toISOString(),
    entries: Object.fromEntries(
      args.entries.map((entry) => [
        entry.name,
        {
          path: toPosixPath(path.relative(args.rootDir, entry.path)),
          source: entry.source,
        },
      ]),
    ),
    outputs: args.outputs.map((output) => toPosixPath(path.relative(args.rootDir, output))),
  };

  await fs.writeFile(`${manifestPath}`, `${JSON.stringify(body, null, 2)}\n`);

  return { manifestPath };
}

export { writeBundlerManifest };
