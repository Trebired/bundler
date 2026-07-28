import type {
  BundlerResolvedSsrModuleMapRuleOptions,
  BundlerSsrModuleMapRule,
  BundlerSsrModuleMapRuleOptions,
} from "#3c8d8166992a";
import {
  DEFAULT_FRONTEND_SSR_MAP_EXPORT,
  DEFAULT_FRONTEND_SSR_MATCHED_EXPORT,
  DEFAULT_FRONTEND_SSR_PAGE_PATTERNS,
  DEFAULT_FRONTEND_SSR_RESOLVER_EXPORT,
  DEFAULT_FRONTEND_SSR_ROOT_EXPORT,
  DEFAULT_FRONTEND_SSR_ROOT_MODULE_EXPORT,
  DEFAULT_FRONTEND_SSR_RULE_KEY,
} from "./defaults.js";

function createSsrModuleMapRule(options: BundlerSsrModuleMapRuleOptions = {}): BundlerSsrModuleMapRule {
  const resolved = resolveSsrModuleMapRuleOptions(options);
  return {
    key: resolved.key,
    include: resolved.include,
    exclude: resolved.exclude,
    strategy: "aggregate",
    aggregate: {
      kind: "module-map",
      allowEmpty: resolved.allowEmpty,
      collapseIndex: resolved.collapseIndex,
      exports: {
        default: resolved.defaultExport,
        map: resolved.mapExport,
        resolver: resolved.resolverExport,
        root: resolved.rootExport,
      },
      matchedModuleExportName: resolved.matchedModuleExportName,
      requireMatchedModuleExport: resolved.requireMatchedModuleExport,
      rootModule: resolved.rootModule,
      rootModuleExportName: resolved.rootModuleExportName,
    },
  };
}

function createReactSsrModuleMapRule(options: BundlerSsrModuleMapRuleOptions = {}): BundlerSsrModuleMapRule {
  return createSsrModuleMapRule(options);
}

function resolveSsrModuleMapRuleOptions(
  options: BundlerSsrModuleMapRuleOptions = {},
): BundlerResolvedSsrModuleMapRuleOptions {
  const rootExport = options.rootExport || DEFAULT_FRONTEND_SSR_ROOT_EXPORT;
  return {
    allowEmpty: options.allowEmpty ?? true,
    collapseIndex: options.collapseIndex ?? true,
    defaultExport: options.defaultExport ?? true,
    exclude: options.exclude,
    include: options.include?.slice() || [...DEFAULT_FRONTEND_SSR_PAGE_PATTERNS],
    key: options.key || DEFAULT_FRONTEND_SSR_RULE_KEY,
    mapExport: options.mapExport || DEFAULT_FRONTEND_SSR_MAP_EXPORT,
    matchedModuleExportName: options.matchedModuleExportName || DEFAULT_FRONTEND_SSR_MATCHED_EXPORT,
    requireMatchedModuleExport: options.requireMatchedModuleExport ?? true,
    resolverExport: options.resolverExport || DEFAULT_FRONTEND_SSR_RESOLVER_EXPORT,
    rootExport,
    rootModule: options.rootModule,
    rootModuleExportName: options.rootModuleExportName || options.rootExport || DEFAULT_FRONTEND_SSR_ROOT_MODULE_EXPORT,
  };
}

export {
  createReactSsrModuleMapRule,
  createSsrModuleMapRule,
  resolveSsrModuleMapRuleOptions,
};
