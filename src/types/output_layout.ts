type BundlerOutputLayoutKind = "asset" | "css" | "js" | "map";

type BundlerOutputLayoutPatterns = {
  asset?: string;
  css?: string;
  js?: string;
  map?: string | "alongside";
};

type BundlerOutputLayoutOptions = boolean | BundlerOutputLayoutPatterns;

type BundlerOutputLayoutMove = {
  bytes: number;
  from: string;
  kind: BundlerOutputLayoutKind;
  to: string;
};

type BundlerOutputLayoutStats = {
  moved: BundlerOutputLayoutMove[];
};

export type {
  BundlerOutputLayoutKind,
  BundlerOutputLayoutMove,
  BundlerOutputLayoutOptions,
  BundlerOutputLayoutPatterns,
  BundlerOutputLayoutStats,
};
