import type {
  BundlerSsrModuleMapRule,
  BundlerSsrModuleMapRuleOptions,
} from "#3c8d8166992a";

function createSsrModuleMapRule(options: BundlerSsrModuleMapRuleOptions): BundlerSsrModuleMapRule {
  return {
    key: options.key,
    include: options.include,
    exclude: options.exclude,
    strategy: "aggregate",
    aggregate: {
      kind: "module-map",
      allowEmpty: options.allowEmpty,
      collapseIndex: options.collapseIndex ?? true,
      exports: {
        default: options.defaultExport ?? true,
        map: options.mapExport || "modules",
        resolver: options.resolverExport || "getModule",
        root: options.rootExport || "rootModule",
      },
      matchedModuleExportName: options.matchedModuleExportName || "default",
      requireMatchedModuleExport: options.requireMatchedModuleExport,
      rootModule: options.rootModule,
      rootModuleExportName: options.rootModuleExportName || options.rootExport || "default",
    },
  };
}

function createReactSsrModuleMapRule(options: BundlerSsrModuleMapRuleOptions): BundlerSsrModuleMapRule {
  return createSsrModuleMapRule(options);
}

export {
  createReactSsrModuleMapRule,
  createSsrModuleMapRule,
};
