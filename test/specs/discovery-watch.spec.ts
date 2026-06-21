import { describe, expect, test } from "bun:test";

import { createDiscoveryWatcher } from "#sv3iqugy67ty";
import { tempDir } from "./helpers";

describe("discovery watcher", () => {
  test("stays idle when the filesystem has not changed", async () => {
    const root = tempDir();
    let changes = 0;

    const watcher = createDiscoveryWatcher({
      dirs: [root],
      onChange() {
        changes += 1;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 450));
    watcher.close();

    expect(changes).toBe(0);
  });
});
