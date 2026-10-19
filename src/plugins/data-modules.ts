import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "esbuild";

import { loadConfig } from "#z1hxysbp7ydt";

const DATA_MODULE_FILTER = /^bundler-data:/;
const DEFAULT_DATA_DIR = "dist/data";

async function dataDirOf(rootDir: string): Promise<string> {
  const loaded = await loadConfig(rootDir).catch (() => null);
  return path.resolve(rootDir, loaded?.config.data?.dir || DEFAULT_DATA_DIR);
}

function createDataModulesPlugin(options: { rootDir: string }): Plugin {
  let dataDir: Promise<string>|null = null;
  return {
    name: "package-data-modules",
    setup(build) {
      build.onResolve({ filter: DATA_MODULE_FILTER }, async(args) => {
          const name = args.path.slice("bundler-data:".length);
          if (!/^[\w-]+$/u.test(name)) return { errors: [{ text: `bundler-data source "${name}" is not a source name` }] };
          dataDir ??= dataDirOf(options.rootDir);
          const file = path.join(await dataDir, `${name}.json`);
          const exists = await fs.stat(file).then((stats) => stats.isFile()).catch (() => false);
          if (exists) return { path: file, sideEffects: false };
          return { errors: [{ text: `bundler-data source "${name}" was never synced: ${file} is missing; run syncBundlerData() first` }] };
      });
    },
  };
}

export { createDataModulesPlugin, DATA_MODULE_FILTER };
