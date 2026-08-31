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

/**
 * Discovers entries and appends the synthesized client-root and
 * frontend-config-style entries, in that order.
 *
 * `bundle()` and `watch()` both need this exact composition: a project
 * configured with `clientRoot` must have it excluded from normal discovery
 * (`withClientRootIgnored`) and re-added as its own synthesized entry
 * (`appendClientRootEntry`), or that entry is silently missing from the
 * manifest. `watch()` used to reimplement discovery inline without either
 * call, so a `clientRoot`-configured project built correctly once via
 * `bundle()` and then lost its client entry on the very next watch rebuild,
 * with no error — whatever read the manifest just found nothing there.
 */
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
