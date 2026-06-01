import type { BuildContext } from "esbuild";
import { context as createContext } from "esbuild";
import { logPackageInitialized } from "@trebired/logger-adapter";

import { BUNDLER_LOG_GROUP, BUNDLER_PACKAGE_NAME } from "../constants.js";
import { resolveLogger } from "../logging.js";
import type { BundlerBuildResult, BundlerOptions, BundlerWatchSession } from "../types.js";
import { createEsbuildOptions, normalizeBundlerOptions } from "./esbuild-options.js";
import { resolveBundlerEntries, normalizeDiscoverRoots, toPublicEntryMap } from "./discovery.js";
import { createDiscoveryWatcher } from "./discovery-watch.js";
import { cleanOutDir, formatFailure, logWarnings, toBuildResult } from "./shared.js";

async function watch(options: BundlerOptions): Promise<BundlerWatchSession> {
  const normalized = normalizeBundlerOptions(options || {} as BundlerOptions);
  const logger = resolveLogger(normalized.logger, normalized.loggerAdapter);

  logPackageInitialized({
    adapter: normalized.loggerAdapter,
    fallback: "console",
    group: BUNDLER_LOG_GROUP,
    logger: normalized.logger,
    source: BUNDLER_PACKAGE_NAME,
  });

  if (normalized.clean) {
    logger.info("watch", `clean :: ${normalized.outDir}`);
    await cleanOutDir(normalized.outDir);
  }

  let disposed = false;
  let currentEntries = await resolveBundlerEntries(options || {} as BundlerOptions, normalized.rootDir, {
    allowEmpty: true,
  });
  let currentContext: BuildContext<any> | null = null;
  let queued = Promise.resolve();

  const callHook = async (args: {
    hook: BundlerOptions["onEntrySetChanged"] | BundlerOptions["onRebuilt"];
    name: "onEntrySetChanged" | "onRebuilt";
    payload: Record<string, string> | BundlerBuildResult;
  }): Promise<void> => {
    if (typeof args.hook !== "function") return;

    try {
      await args.hook(args.payload as never);
    } catch (error) {
      logger.fail("watch", `${args.name}-failed :: ${formatFailure(error)}`);
      throw error;
    }
  };

  const createWatchedContext = async (records = currentEntries.records): Promise<BuildContext<any>> => {
    const context = await createContext(createEsbuildOptions({
      ...normalized,
      entryRecords: records,
    }, logger));
    await context.watch();
    return context;
  };

  const executeRebuild = async (): Promise<BundlerBuildResult> => {
    if (!currentContext) {
      const emptyResult = {
        entries: {},
        outputs: [],
        warnings: 0,
        manifestPath: undefined,
        durationMs: 0,
      };
      await callHook({
        hook: normalized.onRebuilt,
        name: "onRebuilt",
        payload: emptyResult,
      });
      return emptyResult;
    }
    const startedAt = Date.now();
    const result = await currentContext.rebuild();
    logWarnings(logger, result.warnings);
    const summary = await toBuildResult({
      entries: currentEntries.records,
      manifest: normalized.manifest,
      outDir: normalized.outDir,
      result,
      rootDir: normalized.rootDir,
      startedAt,
    });
    logger.info("watch", `rebuilt :: outputs=${summary.outputs.length} warnings=${summary.warnings}`);
    await callHook({
      hook: normalized.onRebuilt,
      name: "onRebuilt",
      payload: summary,
    });
    return summary;
  };

  const refreshDiscovery = async (): Promise<void> => {
    const nextEntries = await resolveBundlerEntries(options || {} as BundlerOptions, normalized.rootDir, {
      allowEmpty: true,
    });
    if (nextEntries.signature === currentEntries.signature) return;

    logger.info("watch", `entry-set-changed :: count=${nextEntries.records.length}`);
    await callHook({
      hook: normalized.onEntrySetChanged,
      name: "onEntrySetChanged",
      payload: toPublicEntryMap(nextEntries.records, normalized.rootDir),
    });
    currentEntries = nextEntries;

    if (currentContext) {
      await currentContext.dispose();
      currentContext = null;
    }

    await cleanOutDir(normalized.outDir);
    if (currentEntries.records.length === 0) {
      logger.info("watch", "entry-set-empty");
      return;
    }

    currentContext = await createWatchedContext(currentEntries.records);
    await executeRebuild();
  };

  const runExclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queued.then(task, task);
    queued = next.then(() => undefined, () => undefined);
    return next;
  };

  const discoveryRoots = normalizeDiscoverRoots(normalized.rootDir, options.discover);
  const discoveryWatcher = discoveryRoots.length
    ? createDiscoveryWatcher({
      dirs: discoveryRoots,
      onChange() {
        void runExclusive(async () => {
          if (disposed) return;
          try {
            await refreshDiscovery();
          } catch (error) {
            logger.fail("watch", `discovery-refresh-failed :: ${formatFailure(error)}`);
          }
        });
      },
    })
    : null;

  try {
    logger.info("watch", "start");
    logger.info("watch", `entries :: count=${currentEntries.records.length}`);
    if (currentEntries.records.length > 0) {
      currentContext = await createWatchedContext(currentEntries.records);
      await executeRebuild();
    }

    return {
      async rebuild() {
        return runExclusive(async () => {
          try {
            await refreshDiscovery();
            return await executeRebuild();
          } catch (error) {
            logger.fail("watch", `rebuild-failed :: ${formatFailure(error)}`);
            throw error;
          }
        });
      },
      async dispose() {
        logger.info("watch", "dispose");
        disposed = true;
        discoveryWatcher?.close();
        if (currentContext) {
          await currentContext.dispose();
        }
      },
    };
  } catch (error) {
    logger.fail("watch", `failed :: ${formatFailure(error)}`);
    disposed = true;
    discoveryWatcher?.close();
    if (currentContext) {
      await currentContext.dispose();
    }
    throw error;
  }
}

export { watch };
