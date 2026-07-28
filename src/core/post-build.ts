import type { BuildResult } from "esbuild";

import type { BundlerOutputLayoutStats, BundlerPrecompressStats } from "#3c8d8166992a";
import { applyOutputLayout } from "./output-layout.js";
import { precompressAssets } from "./precompression.js";
import type { NormalizedBundlerOptions } from "./esbuild-options.js";

type PostProcessedBuildOutput = {
  outputLayout?: BundlerOutputLayoutStats;
  outputs: string[];
  precompressed?: BundlerPrecompressStats;
};

async function postProcessBuildOutput(args: {
  normalized: NormalizedBundlerOptions;
  result: BuildResult<any>;
}): Promise<PostProcessedBuildOutput> {
  const outputLayout = await applyOutputLayout({
    outDir: args.normalized.outDir,
    outputLayout: args.normalized.outputLayout,
    publicPath: args.normalized.publicPath,
    result: args.result,
    rootDir: args.normalized.rootDir,
  });
  const precompressed = args.normalized.precompress.enabled
    ? await precompressAssets({ ...args.normalized.precompress, outDir: args.normalized.outDir, outputs: outputLayout.outputs })
    : undefined;

  return {
    outputLayout: outputLayout.stats,
    outputs: outputLayout.outputs,
    precompressed,
  };
}

export { postProcessBuildOutput };
export type { PostProcessedBuildOutput };
