import { context as createContext } from "esbuild";
import { logPackageInitialized } from "@trebired/logger-adapter";
import { BUNDLER_LOG_GROUP, BUNDLER_PACKAGE_NAME } from "../src/constants.js";
import { resolveLogger } from "../src/logging.js";
import { createEsbuildOptions, normalizeBundlerOptions } from "./esbuild-options.js";
import { resolveBundlerEntries, normalizeDiscoverRoots } from "./discovery.js";
import { createDiscoveryWatcher } from "./discovery-watch.js";
import { cleanOutDir, formatFailure, logWarnings, toBuildResult } from "./shared.js";
async function watch(options) {
    const state = await createWatchState(options);
    try {
        await startWatchState(state);
        return createWatchSession(state);
    }
    catch (error) {
        await failWatchState(state, error);
        throw error;
    }
}
async function createWatchState(options) {
    const normalized = normalizeBundlerOptions(options || {});
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
    return {
        currentContext: null,
        currentDiscovery: await resolveBundlerEntries(options || {}, normalized.rootDir, { allowEmpty: true }),
        discoveryWatcher: null,
        disposed: false,
        logger,
        normalized,
        options,
        queued: Promise.resolve(),
    };
}
async function startWatchState(state) {
    state.discoveryWatcher = createWatchStateWatcher(state);
    state.logger.info("watch", "start");
    state.logger.info("watch", `entries :: count=${state.currentDiscovery.entries.length}`);
    if (state.currentDiscovery.entries.length > 0) {
        state.currentContext = await createWatchedContext(state, state.currentDiscovery.entries);
        await executeRebuild(state);
    }
}
function createWatchSession(state) {
    return {
        rebuild: () => runExclusive(state, async () => {
            try {
                await refreshDiscovery(state);
                return await executeRebuild(state);
            }
            catch (error) {
                state.logger.fail("watch", `rebuild-failed :: ${formatFailure(error)}`);
                throw error;
            }
        }),
        dispose: () => disposeWatchState(state),
    };
}
async function failWatchState(state, error) {
    state.logger.fail("watch", `failed :: ${formatFailure(error)}`);
    await disposeWatchState(state);
}
function createWatchStateWatcher(state) {
    const discoveryRoots = normalizeDiscoverRoots(state.normalized.rootDir, state.options.discover);
    return discoveryRoots.length
        ? createDiscoveryWatcher({
            dirs: discoveryRoots,
            onChange() {
                void runExclusive(state, async () => {
                    if (state.disposed)
                        return;
                    try {
                        await refreshDiscovery(state);
                    }
                    catch (error) {
                        state.logger.fail("watch", `discovery-refresh-failed :: ${formatFailure(error)}`);
                    }
                });
            },
        })
        : null;
}
async function callHook(state, args) {
    if (typeof args.hook !== "function")
        return;
    try {
        await args.hook(args.payload);
    }
    catch (error) {
        state.logger.fail("watch", `${args.name}-failed :: ${formatFailure(error)}`);
        throw error;
    }
}
async function createWatchedContext(state, records = state.currentDiscovery.entries) {
    const context = await createContext(createEsbuildOptions({
        ...state.normalized,
        entryRecords: records,
    }, state.logger));
    await context.watch();
    return context;
}
async function executeRebuild(state) {
    if (!state.currentContext) {
        const emptyResult = createEmptyBuildResult();
        await callHook(state, { hook: state.normalized.onRebuilt, name: "onRebuilt", payload: emptyResult });
        return emptyResult;
    }
    const startedAt = Date.now();
    const result = await state.currentContext.rebuild();
    logWarnings(state.logger, result.warnings);
    const summary = await toBuildResult({
        manifest: state.normalized.manifest,
        outDir: state.normalized.outDir,
        resolvedDiscovery: state.currentDiscovery,
        result,
        rootDir: state.normalized.rootDir,
        startedAt,
    });
    state.logger.info("watch", `rebuilt :: outputs=${summary.outputs.length} warnings=${summary.warnings}`);
    await callHook(state, { hook: state.normalized.onRebuilt, name: "onRebuilt", payload: summary });
    return summary;
}
async function refreshDiscovery(state) {
    const nextDiscovery = await resolveBundlerEntries(state.options || {}, state.normalized.rootDir, {
        allowEmpty: true,
    });
    if (nextDiscovery.signature === state.currentDiscovery.signature)
        return;
    state.logger.info("watch", `entry-set-changed :: count=${nextDiscovery.entries.length}`);
    await callHook(state, {
        hook: state.normalized.onEntrySetChanged,
        name: "onEntrySetChanged",
        payload: nextDiscovery.sourceOwners,
    });
    state.currentDiscovery = nextDiscovery;
    if (state.currentContext) {
        await state.currentContext.dispose();
        state.currentContext = null;
    }
    await cleanOutDir(state.normalized.outDir);
    if (state.currentDiscovery.entries.length === 0) {
        state.logger.info("watch", "entry-set-empty");
        return;
    }
    state.currentContext = await createWatchedContext(state, state.currentDiscovery.entries);
    await executeRebuild(state);
}
function runExclusive(state, task) {
    const next = state.queued.then(task, task);
    state.queued = next.then(() => undefined, () => undefined);
    return next;
}
async function disposeWatchState(state) {
    state.logger.info("watch", "dispose");
    state.disposed = true;
    state.discoveryWatcher?.close();
    if (state.currentContext)
        await state.currentContext.dispose();
}
function createEmptyBuildResult() {
    return {
        entries: {},
        outputs: [],
        warnings: 0,
        manifestPath: undefined,
        durationMs: 0,
        resolvedDiscovery: {
            entries: [],
            rules: {},
            sourceOwners: {},
        },
    };
}
export { watch };
//# sourceMappingURL=watch.js.map