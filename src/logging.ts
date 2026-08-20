import { createLog, type LogInstance } from "@package/logger";
import { resolveLogger as resolveSharedLogger } from "@package/logger-adapter";

import { BUNDLER_LOG_GROUP, BUNDLER_PACKAGE_NAME } from "./constants.js";
import type {
  BundlerLogger,
  BundlerLoggerAdapter,
  NormalizedBundlerLogger,
} from "./types.js";

const defaultLoggers = new Map<string, LogInstance>();

function createDefaultBundlerLogger(source = BUNDLER_PACKAGE_NAME): LogInstance {
  const existing = defaultLoggers.get(source);
  if (existing) return existing;

  const logger = createLog({
      console: {
        metadata: false,
        timestamp: false,
      },
      quiet: true,
      save: false,
      source,
  });
  defaultLoggers.set(source, logger);
  return logger;
}

function resolveLogger(
  logger?: BundlerLogger,
  adapter?: BundlerLoggerAdapter,
): NormalizedBundlerLogger {
  return resolveSharedLogger({
      adapter,
      defaultLogger: createDefaultBundlerLogger,
      fallback: "console",
      groupPrefix: BUNDLER_LOG_GROUP,
      logger,
      source: BUNDLER_PACKAGE_NAME,
  }) as NormalizedBundlerLogger;
}

export { createDefaultBundlerLogger, resolveLogger };
