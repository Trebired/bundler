import { resolveLogger as resolveSharedLogger } from "@trebired/logger-adapter";

import { BUNDLER_LOG_GROUP, BUNDLER_PACKAGE_NAME } from "./constants.js";
import type {
  BundlerLogger,
  BundlerLoggerAdapter,
  NormalizedBundlerLogger,
} from "./types.js";

function toBundlerLogGroup(group: string): string {
  const normalized = String(group || "").trim();

  if (!normalized) return BUNDLER_LOG_GROUP;
  if (normalized === BUNDLER_LOG_GROUP || normalized.startsWith(`${BUNDLER_LOG_GROUP}.`)) {
    return normalized;
  }

  return `${BUNDLER_LOG_GROUP}.${normalized}`;
}

function resolveLogger(
  logger?: BundlerLogger,
  adapter?: BundlerLoggerAdapter,
): NormalizedBundlerLogger {
  const resolved = resolveSharedLogger({
    adapter,
    fallback: "console",
    logger,
    source: BUNDLER_PACKAGE_NAME,
  }) as NormalizedBundlerLogger;

  return {
    error(group, message, metadata) {
      resolved.error(toBundlerLogGroup(group), message, metadata);
    },
    fail(group, message, metadata) {
      resolved.fail(toBundlerLogGroup(group), message, metadata);
    },
    info(group, message, metadata) {
      resolved.info(toBundlerLogGroup(group), message, metadata);
    },
    warn(group, message, metadata) {
      resolved.warn(toBundlerLogGroup(group), message, metadata);
    },
  };
}

export { resolveLogger, toBundlerLogGroup };
