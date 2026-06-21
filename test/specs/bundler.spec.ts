import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

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

describe("@trebired/bundler discover-only", () => {
  test("builds client, defer, shared script, and global style outputs from discover rules", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle(createDiscoverConfig(root, {
      annotateSources: true,
    }));

    expect(result.outputs.some((filePath) => filePath.endsWith("/dist/src/app.client.js"))).toBe(true);
    expect(result.outputs.some((filePath) => filePath.endsWith("/dist/src/feature.client.js"))).toBe(true);
    expect(result.outputs.some((filePath) => filePath.endsWith("/dist/src/prefetch.defer.js"))).toBe(true);
    expect(result.outputs.some((filePath) => /\/dist\/bundle-[a-z0-9]+\.js$/.test(filePath))).toBe(true);
    expect(result.outputs.some((filePath) => /\/dist\/bundle-[a-z0-9]+\.css$/.test(filePath))).toBe(true);

    const bundleJsPath = result.outputs.find((filePath) => /\/dist\/bundle-[a-z0-9]+\.js$/.test(filePath));
    const bundleCssPath = result.outputs.find((filePath) => /\/dist\/bundle-[a-z0-9]+\.css$/.test(filePath));

    expect(bundleJsPath).toBeDefined();
    expect(bundleCssPath).toBeDefined();
    expect(readFile(root, "dist/src/app.client.js")).toContain("source: src/app.client.tsx");
    expect(readFile(root, path.relative(root, bundleJsPath!))).toContain("source: src/shared/message.ts");
    expect(readFile(root, path.relative(root, bundleCssPath!))).toContain("source: src/css/site.scss");
    expect(result.entries["src/app.client.tsx"]).toBe("entry:client:src/app.client");
    expect(result.entries["src/shared/message.ts"]).toMatch(/^bundle:shared-script:/);
    expect(result.entries["src/css/theme.css"]).toMatch(/^bundle:global-style:/);
  });

  test("uses explicit minify and stripComments flags instead of package build modes", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const debugLike = await bundle(createDiscoverConfig(root, {
      minify: false,
      stripComments: false,
    }));
    const productionLike = await bundle(createDiscoverConfig(root, {
      minify: true,
      stripComments: true,
      outDir: "./dist-prod",
    }));

    const debugJs = debugLike.outputs.find((filePath) => filePath.endsWith("/dist/src/app.client.js"));
    const prodJs = productionLike.outputs.find((filePath) => filePath.endsWith("/dist-prod/src/app.client.js"));

    expect(debugJs).toBeDefined();
    expect(prodJs).toBeDefined();
    expect(fs.readFileSync(prodJs!, "utf8").length).toBeLessThan(fs.readFileSync(debugJs!, "utf8").length);
  });

  test("writes external source maps when enabled", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle(createDiscoverConfig(root, {
      sourcemap: "external",
    }));

    expect(result.outputs.some((filePath) => filePath.endsWith("/dist/src/app.client.js.map"))).toBe(true);
    expect(result.outputs.some((filePath) => filePath.endsWith(".css.map"))).toBe(true);
  });

  test("supports event-sink and custom adapter logger forms", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const sinkRows: Array<{ group: string; level: string; message: string; metadata?: unknown }> = [];

    await bundle({
      ...createDiscoverConfig(root),
      logger(event) {
        sinkRows.push(event);
      },
    });

    expect(sinkRows.some((row) => row.group === "bundler.initialize" && row.level === "success")).toBe(true);
    expect(sinkRows.some((row) => row.group === "bundler.build" && row.message === "start")).toBe(true);

    const adapterRows: Array<{ severity: string; line: string }> = [];

    await bundle({
      ...createDiscoverConfig(root),
      logger: adapterRows,
      loggerAdapter(logger, event) {
        logger.push({
          line: `${event.group} :: ${event.message}`,
          severity: event.level,
        });
      },
    } as any);

    expect(adapterRows.some((row) => row.severity === "success" && row.line.includes("bundler.initialize"))).toBe(true);
    expect(adapterRows.some((row) => row.severity === "info" && row.line.includes("bundler.build :: complete"))).toBe(true);
  });

  test("bundles all shared scripts and global styles together when they fit under the size limit", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle(createDiscoverConfig(root));
    const outputNames = result.outputs.map((filePath) => path.basename(filePath)).sort();
    const scriptBundles = outputNames.filter((name) => /^bundle-[a-z0-9]+(?:-\d+)?\.js$/.test(name));
    const styleBundles = outputNames.filter((name) => /^bundle-[a-z0-9]+(?:-\d+)?\.css$/.test(name));

    expect(scriptBundles).toHaveLength(1);
    expect(styleBundles).toHaveLength(1);
    expect(readFile(root, `dist/${scriptBundles[0]}`)).toContain("secondary-bundle");
    expect(readFile(root, `dist/${styleBundles[0]}`)).toContain(".theme");
  });

  test("splits grouped bundles only when a rule exceeds maxBundleSize", async () => {
    const root = tempDir();
    createFixtureProject(root);

    writeFile(root, "src/shared/alpha.ts", `
console.log("alpha-${"x".repeat(100)}");
`);
    writeFile(root, "src/shared/bravo.ts", `
console.log("bravo-${"y".repeat(100)}");
`);
    writeFile(root, "src/css/alpha.css", `
.alpha { color: red; }
/* ${"a".repeat(140)} */
`);
    writeFile(root, "src/css/bravo.scss", `
.bravo { color: blue; }
/* ${"b".repeat(140)} */
`);

    const result = await bundle(createDiscoverConfig(root, {
      discover: {
        dir: "./src",
        rules: [
          {
            key: "client",
            include: ["**/*.client.ts", "**/*.client.tsx"],
            strategy: "entry",
          },
          {
            key: "defer",
            include: ["**/*.defer.ts"],
            strategy: "entry",
          },
          {
            key: "global-style",
            include: ["css/**/*.css", "css/**/*.scss"],
            strategy: "bundle",
            maxBundleSize: 260,
          },
          {
            key: "shared-script",
            include: ["shared/**/*.ts", "shared/**/*.js"],
            strategy: "bundle",
            maxBundleSize: 260,
          },
        ],
      },
    }));

    const outputNames = result.outputs.map((filePath) => path.basename(filePath)).sort();
    expect(outputNames.filter((name) => /^bundle-[a-z0-9]+(?:-\d+)?\.js$/.test(name)).length).toBe(2);
    expect(outputNames.filter((name) => /^bundle-[a-z0-9]+(?:-\d+)?\.css$/.test(name)).length).toBe(3);
  });

  test("fails when a discovered file does not match any rule", async () => {
    const root = tempDir();
    createFixtureProject(root);
    writeFile(root, "src/rogue.ts", `console.log("rogue");`);

    await expect(bundle(createDiscoverConfig(root))).rejects.toThrow("bundler-discover-unmatched-file :: src/rogue.ts");
  });

  test("fails when a grouped source file is larger than maxBundleSize", async () => {
    const root = tempDir();
    createFixtureProject(root);
    writeFile(root, "src/shared/oversized.ts", `
console.log("${"z".repeat(300)}");
`);

    await expect(bundle(createDiscoverConfig(root, {
      discover: {
        dir: "./src",
        rules: [
          {
            key: "client",
            include: ["**/*.client.ts", "**/*.client.tsx"],
            strategy: "entry",
          },
          {
            key: "defer",
            include: ["**/*.defer.ts"],
            strategy: "entry",
          },
          {
            key: "global-style",
            include: ["css/**/*.css", "css/**/*.scss"],
            strategy: "bundle",
          },
          {
            key: "shared-script",
            include: ["shared/**/*.ts", "shared/**/*.js"],
            strategy: "bundle",
            maxBundleSize: 200,
          },
        ],
      },
    }))).rejects.toThrow("bundler-discover-bundle-file-too-large :: src/shared/oversized.ts");
  });

  test("fails when a client or defer entry imports a grouped JS or TS source", async () => {
    const root = tempDir();
    createFixtureProject(root);
    writeFile(root, "src/app.client.tsx", `
import { message } from "./shared/message";
export const view = <section>{message}</section>;
`);

    await expect(bundle(createDiscoverConfig(root))).rejects.toThrow(
      "bundler-discover-entry-imports-grouped-source :: src/app.client.tsx -> src/shared/message.ts",
    );
  });

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
});
