type BundlerPrecompressFormat = "br" | "gzip";

type BundlerPrecompressOptions = boolean | {
  brotliQuality?: number;
  enabled?: boolean;
  exclude?: readonly string[];
  formats?: readonly BundlerPrecompressFormat[];
  gzipLevel?: number;
  include?: readonly string[];
  minSize?: number | string;
};

type BundlerPrecompressAssetsOptions = Exclude<BundlerPrecompressOptions, boolean>& {
  outDir: string;
  outputs?: readonly string[];
};

type BundlerPrecompressedAsset = {
  bytes: number;
  compressedBytes: number;
  format: BundlerPrecompressFormat;
  output: string;
  ratio: number;
  source: string;
};

type BundlerPrecompressStats = {
  assets: BundlerPrecompressedAsset[];
  formats: BundlerPrecompressFormat[];
  totalBytes: number;
  totalCompressedBytes: number;
};

export type {
  BundlerPrecompressAssetsOptions,
  BundlerPrecompressFormat,
  BundlerPrecompressedAsset,
  BundlerPrecompressOptions,
  BundlerPrecompressStats,
};
