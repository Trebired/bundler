import { resolveBundlerEntries } from "./discovery.js";
import type { ResolvedDiscovery } from "./discovery.js";
import { normalizeBundlerOptions } from "./esbuild-options.js";
import {
  appendFrontendConfigStyleEntry,
  createEmptyResolvedDiscovery,
  type PreparedFrontendConfigStyles,
} from "./frontend-config.js";
import { appendClientRootEntry, withClientRootIgnored } from "./frontend_app/client-entry.js";
import type { resolveLogger } from "#dcx0jw9bw3ka";
import type { BundlerOptions } from "#3c8d8166992a";

type NormalizedBundlerOptions = ReturnType<typeof normalizeBundlerOptions>;

async function resolveFrontendDiscovery(
  options: BundlerOptions,
  normalized: NormalizedBundlerOptions,
  logger: ReturnType<typeof resolveLogger>,
  frontendStyles: PreparedFrontendConfigStyles | null,
  discoveryOptions: { allowEmpty?: boolean } = {},
): Promise<ResolvedDiscovery> {
  const synthesizesClientRoot = Boolean(String(options?.clientRoot || "").trim());
  const discoverOptions = synthesizesClientRoot
  ? withClientRootIgnored(options, normalized.rootDir)
  : options;
  const allowEmpty = discoveryOptions.allowEmpty ?? (Boolean(frontendStyles) || synthesizesClientRoot);
  const discoveredEntries = discoverOptions?.discover || !frontendStyles
  ? await resolveBundlerEntries(discoverOptions || {} as BundlerOptions, normalized.rootDir, {
      allowEmpty,
    }, {
      ignoredDirs: normalized.i18n.enabled ? [normalized.i18n.dirName] : [],
  })
  : createEmptyResolvedDiscovery();
  const withStyles = appendFrontendConfigStyleEntry(discoveredEntries, frontendStyles);
  return await appendClientRootEntry(withStyles, options, normalized, logger);
}

export { resolveFrontendDiscovery };
