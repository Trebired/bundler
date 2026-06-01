import { resolveLogger as resolveSharedLogger } from "@trebired/logger-adapter";

import { BUNDLER_PACKAGE_NAME } from "./constants.js";
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
    logger,
    source: BUNDLER_PACKAGE_NAME,
  }) as NormalizedBundlerLogger;
}

export { resolveLogger };
