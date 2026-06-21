import fs from "node:fs";
import path from "node:path";

import type {
  BundlerEntryRecord,
  BundlerOptions,
} from "#jb343639kom2";
import { normalizeDiscoverOptions } from "./normalize.js";
import { normalizePathValue } from "./shared.js";

function toEntryPointMap(records: BundlerEntryRecord[], rootDir: string): Record<string, string> {
  return Object.fromEntries(records.map((record) => [
    record.name,
    record.source === "internal" ? record.path : normalizePathValue(path.relative(rootDir, record.path)),
  ]));
}

function normalizeDiscoverRoots(rootDir: string, discover: BundlerOptions["discover"]): string[] {
  const roots = normalizeDiscoverOptions(rootDir, discover).map((item) => {
    let current = item.dirAbs;
    while (!fs.existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) return rootDir;
      current = parent;
    }
    return current;
  });

  return Array.from(new Set(roots));
}

export {
  normalizeDiscoverRoots,
  toEntryPointMap,
};
