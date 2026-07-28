import type { BundlerDiscoverEntryRule } from "./discovery.js";
import type { BundlerRelatedEntriesOptions } from "./related_entries.js";

type BundlerFrontendEntryRulesOptions = {
  clientExclude?: string[];
  clientInclude?: string[];
  clientKey?: string;
  deferredExclude?: string[];
  deferredInclude?: string[];
  deferredKey?: string;
};

type BundlerFrontendRelatedEntriesOptions = Omit<
  BundlerRelatedEntriesOptions,
  "candidateExtensions" | "candidatePatterns" | "candidateSuffixes"
> & {
  candidatePatterns?: readonly string[];
};

type BundlerFrontendEntryRule = BundlerDiscoverEntryRule;

export type {
  BundlerFrontendEntryRule,
  BundlerFrontendEntryRulesOptions,
  BundlerFrontendRelatedEntriesOptions,
};
