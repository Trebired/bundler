import fs from "node:fs/promises";
import path from "node:path";
import type { Metafile } from "esbuild";

import type { BundlerOutputLayoutStats, BundlerPrecompressStats, BundlerResolvedDiscovery } from "#3c8d8166992a";
import { buildAssetManifest } from "./asset-manifest.js";
import type { NormalizedManifestOptions } from "./discovery.js";
import { deriveManifest } from "./derive-manifest.js";

type ManifestWriteResult = {
  manifestPath?: string;
};

async function writeBundlerManifest(args: {
    metafile?: Metafile;
    manifest: NormalizedManifestOptions;
    outDir: string;
    outputLayout?: BundlerOutputLayoutStats;
    precompressed?: BundlerPrecompressStats;
    resolvedDiscovery: BundlerResolvedDiscovery;
    rootDir: string;
}): Promise<ManifestWriteResult> {
  if (!args.manifest.enabled || !args.manifest.file || !args.metafile) {
    return {};
  }

  const manifestPath = path.resolve(args.outDir, args.manifest.file);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });

  const body = {
    generatedAt: new Date().toISOString(),
    resolvedDiscovery: args.resolvedDiscovery,
    assetManifest: buildAssetManifest({
        metafile: args.metafile,
        outDir: args.outDir,
        resolvedDiscovery: args.resolvedDiscovery,
        rootDir: args.rootDir,
    }),
    ...(args.outputLayout ? { outputLayout: args.outputLayout } : {}),
    ...(args.precompressed ? { precompressed: args.precompressed } : {}),
    ...deriveManifest(args.metafile, {
        outDir: args.outDir,
        rootDir: args.rootDir,
    }),
  };

  await fs.writeFile(`${manifestPath}`, `${JSON.stringify(body, null, 2)}\n`);

  return { manifestPath };
}

export { writeBundlerManifest };
