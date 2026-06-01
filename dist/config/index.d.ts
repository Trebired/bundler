import type { BundlerOptions, LoadedBundlerConfig } from "../types.js";
declare function defineBundlerConfig(config: BundlerOptions): BundlerOptions;
declare function loadBundlerConfigModule(projectRoot: string, configPath: string): Promise<LoadedBundlerConfig>;
export { defineBundlerConfig, loadBundlerConfigModule };
//# sourceMappingURL=index.d.ts.map