import type {
  BundlerAssetManifest,
  BundlerFrontendAppBundlerConfig,
  BundlerFrontendGlobalClientEntries,
} from "#3c8d8166992a";
import { matchesAnyPattern, normalizePathValue } from "#tsnh4vdfql8p";

function resolveFrontendGlobalClientEntries(args: {
  entries: BundlerFrontendGlobalClientEntries;
  exclude?: readonly string[];
  frontendDir: string;
  include: readonly string[];
  manifest?: BundlerAssetManifest;
}): string[] {
  if (Array.isArray(args.entries)) return stableEntries(args.entries);
  if (args.entries !== "auto" || !args.manifest) return [];
  const frontendDir = normalizePathValue(args.frontendDir);
  return stableEntries(Object.keys(args.manifest.sources).filter((source) => {
    const discoverRel = toFrontendRelativeSource(source, frontendDir);
    if (!discoverRel) return false;
    if (!matchesAnyPattern(discoverRel, [...args.include])) return false;
    return !matchesAnyPattern(discoverRel, [...(args.exclude || [])]);
  }));
}

function resolveConfiguredFrontendGlobalClientEntries(
  config: BundlerFrontendAppBundlerConfig,
  manifest?: BundlerAssetManifest,
): string[] {
  return resolveFrontendGlobalClientEntries({
    entries: config.globalClientEntries,
    exclude: config.globalClientEntryExclude,
    frontendDir: config.frontendDir,
    include: config.globalClientEntryInclude,
    manifest,
  });
}

function toFrontendRelativeSource(source: string, frontendDir: string): string {
  const normalized = normalizePathValue(source);
  if (!frontendDir) return normalized;
  return normalized.startsWith(`${frontendDir}/`) ? normalized.slice(frontendDir.length + 1) : "";
}

function stableEntries(entries: readonly string[]): string[] {
  return Array.from(new Set(entries.map(normalizePathValue).filter(Boolean))).sort();
}

export {
  resolveConfiguredFrontendGlobalClientEntries,
  resolveFrontendGlobalClientEntries,
};
