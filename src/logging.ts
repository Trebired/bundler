import { resolveLogger as resolveSharedLogger } from "@package/logger-adapter";

import { BUNDLER_LOG_GROUP, BUNDLER_PACKAGE_NAME } from "./constants.js";
import type {
  BundlerLogger,
  BundlerLoggerAdapter,
  NormalizedBundlerLogger,
} from "./types.js";

function resolveLogger(
  logger?: BundlerLogger,
  adapter?: BundlerLoggerAdapter,
): NormalizedBundlerLogger {
  return resolveSharedLogger({
      adapter,
      fallback: "console",
      groupPrefix: BUNDLER_LOG_GROUP,
      logger,
      source: BUNDLER_PACKAGE_NAME,
  }) as NormalizedBundlerLogger;
}

export { resolveLogger };
