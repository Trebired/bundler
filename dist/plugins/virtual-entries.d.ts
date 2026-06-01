import type { Plugin } from "esbuild";
import type { BundlerEntryRecord, NormalizedBundlerLogger } from "../types.js";
import type { ClassNameMap } from "./obfuscation.js";
declare const VIRTUAL_ENTRY_NAMESPACE = "trebired-virtual-entry";
type VirtualEntriesPluginOptions = {
    classNameMap?: ClassNameMap;
    entries: BundlerEntryRecord[];
    logger: NormalizedBundlerLogger;
    rootDir: string;
};
declare function createVirtualEntriesPlugin(options: VirtualEntriesPluginOptions): Plugin;
export { VIRTUAL_ENTRY_NAMESPACE, createVirtualEntriesPlugin };
//# sourceMappingURL=virtual-entries.d.ts.map