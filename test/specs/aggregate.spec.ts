import { describe, expect, test } from "bun:test";

import { bundle, collectAssetLinks, watch } from "#sof0gxa0cxhk";
import type { BundlerOptions } from "#sof0gxa0cxhk";
import { createAggregateFixtureProject, exists, readFile, tempDir, waitFor, writeFile } from "./helpers";

function createAggregateConfig(root: string, overrides: Partial<BundlerOptions> = {}): BundlerOptions {
  return {
    discover: {
      dir: "./src/frontend",
      rules: [
        {
          key: "client",
          include: ["**/*.client.ts", "**/*.client.tsx"],
          strategy: "entry" as const,
        },
        {
          key: "defer",
          include: ["**/*.defer.ts", "**/*.defer.tsx"],
          strategy: "entry" as const,
        },
        {
          key: "ignored-tests",
          include: ["**/*.spec.*", "**/*.test.*"],
          strategy: "ignore" as const,
        },
        {
          key: "ssr-pages",
          include: ["pages/**/*.tsx"],
          exclude: ["**/*.client.tsx", "**/*.defer.tsx", "**/*.spec.tsx", "**/*.test.tsx"],
          strategy: "aggregate" as const,
          aggregate: {
            kind: "module-map",
            rootModule: "layouts/root_document.tsx",
            collapseIndex: true,
            exports: {
              root: "rootDocument",
              map: "pages",
              resolver: "getPageComponent",
              default: true,
            },
          },
        },
      ],
    },
    manifest: true,
    outDir: "./dist",
    rootDir: root,
    ...overrides,
  };
}

describe("aggregate discover rules", () => {
  test("builds one internal aggregate entry without requiring any temp source file", async () => {
    const root = tempDir();
    createAggregateFixtureProject(root);

    const result = await bundle(createAggregateConfig(root));
    const aggregateEntry = result.assetManifest?.entries["aggregate:ssr-pages"];

    expect(aggregateEntry).toBeDefined();
    expect(aggregateEntry?.generated).toBe(true);
    expect(aggregateEntry?.entrySource).toBeUndefined();
    expect(aggregateEntry?.aggregate).toEqual({
      kind: "module-map",
      rootModule: "src/frontend/layouts/root_document.tsx",
      matchedSources: [
        "src/frontend/pages/blog/post.tsx",
        "src/frontend/pages/home.tsx",
        "src/frontend/pages/settings/index.tsx",
      ],
    });

    expect(exists(root, "tmp")).toBe(false);
    expect(exists(root, "src/frontend-bundler-generated")).toBe(false);

    const outputRel = `dist/${aggregateEntry!.file}`;
    const output = readFile(root, outputRel);

    expect(output).toContain("\"home\":");
    expect(output).toContain("\"blog/post\":");
    expect(output).toContain("\"settings\":");
    expect(output).toContain("rootDocument");
    expect(output).not.toContain("\"settings/index\":");
    expect(output).not.toContain("frontend-bundler-generated");
  });

  test("writes aggregate metadata into the manifest and supports collectAssetLinks from ruleKey", async () => {
    const root = tempDir();
    createAggregateFixtureProject(root);

    const result = await bundle(createAggregateConfig(root));
    const manifest = result.assetManifest!;

    expect(manifest.rules["ssr-pages"].aggregate).toEqual({
      kind: "module-map",
      rootModule: "src/frontend/layouts/root_document.tsx",
    });
    expect(manifest.rules["ssr-pages"].entryKeys).toEqual(["aggregate:ssr-pages"]);
    expect(manifest.sources["src/frontend/layouts/root_document.tsx"].entryKey).toBe("aggregate:ssr-pages");
    expect(manifest.sources["src/frontend/pages/home.tsx"].entryKey).toBe("aggregate:ssr-pages");

    const links = collectAssetLinks(manifest, ["ssr-pages"], {
      from: "ruleKey",
      publicPath: "/",
    });

    expect(links.entryKeys).toEqual(["aggregate:ssr-pages"]);
    expect(links.scripts.some((value) => /\/aggregate-[a-z0-9]+\.js$/.test(value))).toBe(true);
    expect(links.missing).toEqual([]);
  });

  test("rebuilds aggregate membership in watch mode when matching files are added", async () => {
    const root = tempDir();
    createAggregateFixtureProject(root);

    let latestFile = "";
    let latestSources: string[] = [];

    const session = await watch({
      ...createAggregateConfig(root),
      async onRebuilt(result) {
        const aggregateEntry = result.assetManifest?.entries["aggregate:ssr-pages"];
        latestFile = aggregateEntry?.file || "";
        latestSources = aggregateEntry?.sources || [];
      },
    });

    writeFile(root, "src/frontend/pages/account/index.tsx", `
export default function AccountIndexPage() {
  return "account-index-page";
}
`);

    await waitFor(() => latestSources.includes("src/frontend/pages/account/index.tsx"));
    await waitFor(() => latestFile.length > 0 && exists(root, `dist/${latestFile}`));

    expect(readFile(root, `dist/${latestFile}`)).toContain("\"account\":");

    await session.dispose();
  });

  test("fails aggregate rules when allowEmpty is false and nothing matches", async () => {
    const root = tempDir();
    writeFile(root, "src/frontend/layouts/root_document.tsx", `
export default function RootDocument() {
  return "root";
}
`);

    await expect(bundle(createAggregateConfig(root))).rejects.toThrow("bundler-discover-aggregate-empty :: ssr-pages");
  });

  test("fails aggregate rules when the root module cannot be resolved", async () => {
    const root = tempDir();
    createAggregateFixtureProject(root);

    await expect(bundle(createAggregateConfig(root, {
      discover: {
        dir: "./src/frontend",
        rules: [
          {
            key: "ssr-pages",
            include: ["pages/**/*.tsx"],
            exclude: ["**/*.client.tsx", "**/*.defer.tsx", "**/*.spec.tsx", "**/*.test.tsx"],
            strategy: "aggregate",
            aggregate: {
              kind: "module-map",
              rootModule: "layouts/missing_root.tsx",
            },
          },
          {
            key: "ignored-tests",
            include: ["**/*.spec.*", "**/*.test.*", "**/*.client.*", "**/*.defer.*"],
            strategy: "ignore",
          },
        ],
      },
    }))).rejects.toThrow("bundler-discover-aggregate-root-module-not-found :: ssr-pages :: layouts/missing_root.tsx");
  });

  test("fails aggregate rules when matched files are unsupported", async () => {
    const root = tempDir();
    writeFile(root, "src/frontend/layouts/root_document.tsx", `
export default function RootDocument() {
  return "root";
}
`);
    writeFile(root, "src/frontend/pages/home.css", `
.home { color: red; }
`);

    await expect(bundle({
      discover: {
        dir: "./src/frontend",
        rules: [
          {
            key: "ssr-pages",
            include: ["pages/**/*"],
            strategy: "aggregate",
            aggregate: {
              kind: "module-map",
              rootModule: "layouts/root_document.tsx",
              allowEmpty: true,
            },
          },
        ],
      },
      outDir: "./dist",
      rootDir: root,
    })).rejects.toThrow("bundler-discover-aggregate-unsupported-file :: ssr-pages :: src/frontend/pages/home.css");
  });
});
