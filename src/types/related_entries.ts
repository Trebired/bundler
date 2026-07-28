import type {
  BundlerImportGraph,
  BundlerImportGraphOptions,
  BundlerImportGraphTsconfigOptions,
} from "./import_graph.js";

type BundlerRelatedEntryMatch = {
  entry: string;
  pattern: string;
  source: string;
};

type BundlerRelatedEntriesOptions = {
  candidateExtensions?: readonly string[];
  candidatePatterns?: readonly string[];
  candidateSuffixes?: readonly string[];
  extensions?: BundlerImportGraphOptions["extensions"];
  rootDir?: string;
  sources: string | string[];
  tsconfig?: BundlerImportGraphTsconfigOptions;
};

type BundlerRelatedEntriesResult = {
  entries: string[];
  graph: BundlerImportGraph;
  matches: BundlerRelatedEntryMatch[];
};

export type {
  BundlerRelatedEntriesOptions,
  BundlerRelatedEntriesResult,
  BundlerRelatedEntryMatch,
};
