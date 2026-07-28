import type {
  BundlerFrontendEntryRule,
  BundlerFrontendEntryRulesOptions,
  BundlerFrontendRelatedEntriesOptions,
  BundlerRelatedEntriesResult,
} from "#3c8d8166992a";
import { collectRelatedEntries } from "./related-entries.js";

const DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS = [
  "**/*.client.ts",
  "**/*.client.tsx",
  "**/*.client.js",
  "**/*.client.jsx",
  "**/*.client.css",
  "**/*.client.scss",
] as const;

const DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS = [
  "**/*.client.defer.ts",
  "**/*.client.defer.tsx",
  "**/*.client.defer.js",
  "**/*.client.defer.jsx",
] as const;

const DEFAULT_FRONTEND_RELATED_ENTRY_PATTERNS = [
  "[path].client.ts",
  "[path].client.tsx",
  "[path].client.js",
  "[path].client.jsx",
  "[path].client.css",
  "[path].client.scss",
  "[path].client.defer.ts",
  "[path].client.defer.tsx",
  "[path].client.defer.js",
  "[path].client.defer.jsx",
] as const;

function createFrontendEntryRules(options: BundlerFrontendEntryRulesOptions = {}): BundlerFrontendEntryRule[] {
  return [
    {
      key: options.clientKey || "client",
      include: options.clientInclude || [...DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS],
      exclude: options.clientExclude,
      strategy: "entry",
    },
    {
      key: options.deferredKey || "client-defer",
      include: options.deferredInclude || [...DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS],
      exclude: options.deferredExclude,
      strategy: "entry",
    },
  ];
}

async function collectRelatedFrontendEntries(
  options: BundlerFrontendRelatedEntriesOptions,
): Promise<BundlerRelatedEntriesResult> {
  return collectRelatedEntries({
    ...options,
    candidatePatterns: options.candidatePatterns || DEFAULT_FRONTEND_RELATED_ENTRY_PATTERNS,
  });
}

export {
  collectRelatedFrontendEntries,
  createFrontendEntryRules,
  DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_RELATED_ENTRY_PATTERNS,
};
