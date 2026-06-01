import type { BundlerLogger, BundlerLoggerAdapter, NormalizedBundlerLogger } from "./types.js";
declare function toBundlerLogGroup(group: string): string;
declare function resolveLogger(logger?: BundlerLogger, adapter?: BundlerLoggerAdapter): NormalizedBundlerLogger;
export { resolveLogger, toBundlerLogGroup };
//# sourceMappingURL=logging.d.ts.map