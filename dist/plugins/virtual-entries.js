import { VIRTUAL_ENTRY_PREFIX } from "../core/discovery.js";
const VIRTUAL_ENTRY_NAMESPACE = "trebired-virtual-entry";
function createVirtualEntriesPlugin(options) {
    const byName = new Map(options.entries
        .filter((entry) => entry.source === "virtual")
        .map((entry) => [entry.name, entry.contents || ""]));
    return {
        name: "trebired-virtual-entries",
        setup(build) {
            build.onResolve({ filter: /^trebired-virtual:/ }, (args) => {
                const name = args.path.slice(VIRTUAL_ENTRY_PREFIX.length);
                if (!byName.has(name)) {
                    options.logger.fail("build", `virtual-entry-missing :: ${name}`);
                    throw new Error(`bundler-virtual-entry-missing :: ${name}`);
                }
                return {
                    namespace: VIRTUAL_ENTRY_NAMESPACE,
                    path: name,
                };
            });
            build.onLoad({ filter: /.*/, namespace: VIRTUAL_ENTRY_NAMESPACE }, async (args) => {
                const contents = byName.get(args.path) || "";
                return {
                    contents,
                    loader: "ts",
                    resolveDir: options.rootDir,
                };
            });
        },
    };
}
export { VIRTUAL_ENTRY_NAMESPACE, createVirtualEntriesPlugin };
//# sourceMappingURL=virtual-entries.js.map