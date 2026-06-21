type BundlerTsconfigPaths = Record<string, string[]>;

type BundlerImportGraphTsconfigOptions = boolean | string | {
  file?: string;
  baseUrl?: string;
  paths?: BundlerTsconfigPaths;
};

type BundlerImportGraphImportKind = "dynamic-import" | "export-from" | "import";

type BundlerImportGraphImport = {
  specifier: string;
  kind: BundlerImportGraphImportKind;
  resolved?: string;
  external: boolean;
};

type BundlerImportGraphFile = {
  path: string;
  imports: BundlerImportGraphImport[];
};

type BundlerImportGraph = {
  entries: string[];
  files: Record<string, BundlerImportGraphFile>;
};

type BundlerImportGraphOptions = {
  entries: string | string[];
  rootDir?: string;
  extensions?: string[];
  tsconfig?: BundlerImportGraphTsconfigOptions;
};

export type {
  BundlerImportGraph,
  BundlerImportGraphFile,
  BundlerImportGraphImport,
  BundlerImportGraphImportKind,
  BundlerImportGraphOptions,
  BundlerImportGraphTsconfigOptions,
  BundlerTsconfigPaths,
};
