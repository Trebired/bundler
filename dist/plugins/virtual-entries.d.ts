import type { Plugin } from "esbuild";
import type { BundlerEntryRecord, NormalizedBundlerLogger } from "../types.js";
declare const VIRTUAL_ENTRY_NAMESPACE = "trebired-virtual-entry";
type VirtualEntriesPluginOptions = {
    entries: BundlerEntryRecord[];
    logger: NormalizedBundlerLogger;
    rootDir: string;
};
declare function createVirtualEntriesPlugin(options: VirtualEntriesPluginOptions): Plugin;
export { VIRTUAL_ENTRY_NAMESPACE, createVirtualEntriesPlugin };
//# sourceMappingURL=virtual-entries.d.ts.map