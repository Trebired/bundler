import type { Plugin } from "esbuild";

import { VIRTUAL_ENTRY_PREFIX } from "../core/discovery.js";
import type { BundlerEntryRecord, BundlerVirtualEntryLoader, NormalizedBundlerLogger } from "../types.js";

const VIRTUAL_ENTRY_NAMESPACE = "trebired-virtual-entry";

type VirtualEntriesPluginOptions = {
  entries: BundlerEntryRecord[];
  logger: NormalizedBundlerLogger;
  rootDir: string;
};

function createVirtualEntriesPlugin(options: VirtualEntriesPluginOptions): Plugin {
  const byName = new Map(
    options.entries
      .filter((entry) => entry.source === "virtual")
      .map((entry) => [entry.name, {
        contents: entry.contents || "",
        loader: entry.virtualLoader || "ts" as BundlerVirtualEntryLoader,
      }]),
  );

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
        const entry = byName.get(args.path) || {
          contents: "",
          loader: "ts" as BundlerVirtualEntryLoader,
        };

        return {
          contents: entry.contents,
          loader: entry.loader,
          resolveDir: options.rootDir,
        };
      });
    },
  };
}

export { VIRTUAL_ENTRY_NAMESPACE, createVirtualEntriesPlugin };
