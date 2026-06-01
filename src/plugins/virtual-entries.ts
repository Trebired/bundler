import type { Plugin } from "esbuild";

import { VIRTUAL_ENTRY_PREFIX } from "../core/discovery.js";
import { rewriteCodeClassTokens } from "./obfuscation.js";
import type { BundlerEntryRecord, NormalizedBundlerLogger } from "../types.js";
import type { ClassNameMap } from "./obfuscation.js";

const VIRTUAL_ENTRY_NAMESPACE = "trebired-virtual-entry";

type VirtualEntriesPluginOptions = {
  classNameMap?: ClassNameMap;
  entries: BundlerEntryRecord[];
  logger: NormalizedBundlerLogger;
  rootDir: string;
};

function createVirtualEntriesPlugin(options: VirtualEntriesPluginOptions): Plugin {
  const byName = new Map(
    options.entries
      .filter((entry) => entry.source === "virtual")
      .map((entry) => [entry.name, entry.contents || ""]),
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
        const contents = byName.get(args.path) || "";

        return {
          contents: options.classNameMap && options.classNameMap.size > 0
            ? rewriteCodeClassTokens({
              classNameMap: options.classNameMap,
              contents,
              filePath: `${args.path}.ts`,
            })
            : contents,
          loader: "ts",
          resolveDir: options.rootDir,
        };
      });
    },
  };
}

export { VIRTUAL_ENTRY_NAMESPACE, createVirtualEntriesPlugin };
