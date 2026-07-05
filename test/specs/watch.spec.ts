import path from "node:path";
import { expect, test } from "bun:test";

import { bundle, deriveManifest, watch } from "#sof0gxa0cxhk";
import type { BundlerOptions } from "#sof0gxa0cxhk";
import { createFixtureProject, exists, readFile, tempDir, waitFor, writeFile } from "./helpers";

function createDiscoverConfig(root: string, overrides: Partial<BundlerOptions> = {}): BundlerOptions {
  return {
    discover: {
      dir: "./src",
      rules: [
        {
          key: "client",
          include: ["**/*.client.ts", "**/*.client.tsx"],
          strategy: "entry" as const,
        },
        {
          key: "defer",
          include: ["**/*.defer.ts"],
          strategy: "entry" as const,
        },
        {
          key: "ignored-tests",
          include: ["**/*.test.*", "**/*.spec.*"],
          strategy: "ignore" as const,
        },
        {
          key: "global-style",
          include: ["css/**/*.css", "css/**/*.scss"],
          strategy: "bundle" as const,
          maxBundleSize: "50mb",
        },
        {
          key: "shared-script",
          include: ["shared/**/*.ts", "shared/**/*.js"],
          strategy: "bundle" as const,
          maxBundleSize: "50mb",
        },
      ],
    },
    outDir: "./dist",
    rootDir: root,
    ...overrides,
  };
}

test("writes a manifest with entry keys, source ownership, grouped membership, and ignored rule state", async () => {
  const root = tempDir();
  createFixtureProject(root);
  writeFile(root, "src/shared/helper.test.ts", `console.log("ignored");`);

  const result = await bundle(createDiscoverConfig(root, {
    manifest: true,
  }));

  expect(result.manifestPath?.endsWith("/dist/bundler-manifest.json")).toBe(true);

  const manifest = JSON.parse(readFile(root, "dist/bundler-manifest.json"));
  expect(manifest.assetManifest.sources["src/app.client.tsx"].entryKey).toBe("entry:client:src/app.client");
  expect(manifest.assetManifest.entries["entry:client:src/app.client"].sources).toEqual(["src/app.client.tsx"]);
  expect(manifest.assetManifest.rules["ignored-tests"].ignoredSources).toContain("src/shared/helper.test.ts");

  const sharedEntryKey = result.entries["src/shared/message.ts"];
  expect(sharedEntryKey).toBeDefined();
  expect(manifest.assetManifest.entries[sharedEntryKey].sources).toContain("src/shared/message.ts");
  expect(manifest.assetManifest.entries[sharedEntryKey].ruleKey).toBe("shared-script");
});

test("watch mode picks up new discovered client entries", async () => {
  const root = tempDir();
  createFixtureProject(root);

  const session = await watch(createDiscoverConfig(root));

  writeFile(root, "src/pages/home.client.tsx", `
export const page = "home";
console.log(page);
`);

  await waitFor(() => exists(root, "dist/src/pages/home.client.js"));
  expect(readFile(root, "dist/src/pages/home.client.js")).toContain("home");

  await session.dispose();
});

test("watch hooks expose source ownership and regroup when discovery changes", async () => {
  const root = tempDir();
  createFixtureProject(root);

  const sequence: string[] = [];

  const session = await watch({
    ...createDiscoverConfig(root),
    async onEntrySetChanged(entries) {
      sequence.push(`entry:${entries["src/pages/home.client.tsx"] || ""}`);
    },
    async onRebuilt(result) {
      sequence.push(`rebuilt:${result.outputs.length}`);
    },
  });

  writeFile(root, "src/pages/home.client.tsx", `
export const page = "home";
console.log(page);
`);

  await waitFor(() => sequence.some((value) => value.startsWith("entry:entry:client:src/pages/home.client")));
  await waitFor(() => exists(root, "dist/src/pages/home.client.js"));
  expect(sequence.some((value) => value.startsWith("rebuilt:"))).toBe(true);

  await session.dispose();
});

test("watch rebuild rejects when lifecycle hooks fail", async () => {
  const root = tempDir();
  createFixtureProject(root);

  await expect(watch({
    ...createDiscoverConfig(root),
    onRebuilt() {
      throw new Error("hook-boom");
    },
  })).rejects.toThrow("hook-boom");
});

test("derives a stable manifest graph from the esbuild metafile", async () => {
  const root = tempDir();
  createFixtureProject(root);

  const result = await bundle(createDiscoverConfig(root));
  const manifest = deriveManifest(result.metafile!, {
    outDir: path.join(root, "dist"),
    rootDir: root,
  });

  expect(manifest.entries["dist/src/app.client.js"].js).toContain("dist/src/app.client.js");
  expect(Object.keys(manifest.entries).some((key) => /^dist\/bundle-[a-z0-9]+\.css$/.test(key))).toBe(true);
  expect(Object.keys(manifest.entries).some((key) => /^dist\/bundle-[a-z0-9]+\.js$/.test(key))).toBe(true);
});
