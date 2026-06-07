import { describe, expect, test } from "bun:test";

import { buildAssetManifest, bundle, collectAssetLinks } from "../../src/index";
import { createFixtureProject, readFile, tempDir } from "./helpers";

function createDiscoverConfig(root: string) {
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
          key: "global-style",
          include: ["css/**/*.css", "css/**/*.scss"],
          strategy: "bundle" as const,
        },
        {
          key: "shared-script",
          include: ["shared/**/*.ts", "shared/**/*.js"],
          strategy: "bundle" as const,
        },
      ],
    },
    outDir: "./dist",
    rootDir: root,
  };
}

describe("asset manifest helpers", () => {
  test("exposes source ownership, entry outputs, and grouped bundle membership", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle({
      ...createDiscoverConfig(root),
      manifest: true,
    });

    expect(result.assetManifest).toBeDefined();
    expect(result.assetManifest?.sources["src/app.client.tsx"].entryKey).toBe("entry:client:src/app.client");

    const sharedEntryKey = result.entries["src/shared/message.ts"];
    expect(sharedEntryKey).toBeDefined();
    expect(result.assetManifest?.entries[sharedEntryKey].sources).toContain("src/shared/message.ts");
    expect(result.assetManifest?.entries[sharedEntryKey].ruleKey).toBe("shared-script");
    expect(Object.keys(result.assetManifest?.entryOutputs || {}).some((key) => /^bundle-[a-z0-9]+\.js$/.test(key))).toBe(true);

    const manifest = buildAssetManifest({
      metafile: result.metafile!,
      outDir: "./dist",
      rootDir: root,
      resolvedDiscovery: result.resolvedDiscovery,
    });

    expect(manifest).toEqual(result.assetManifest);

    const links = collectAssetLinks(manifest, ["src/app.client.tsx", "src/shared/message.ts"], {
      from: "source",
      publicPath: "/",
    });

    expect(links.entryKeys).toEqual([
      "entry:client:src/app.client",
      sharedEntryKey,
    ]);
    expect(links.scripts).toContain("/src/app.client.js");
    expect(links.outputs.some((value) => value.endsWith(".js"))).toBe(true);
    expect(links.missing).toEqual([]);

    const writtenManifest = JSON.parse(readFile(root, "dist/bundler-manifest.json"));
    expect(writtenManifest.assetManifest.sources["src/app.client.tsx"].entryKey).toBe("entry:client:src/app.client");
    expect(writtenManifest.assetManifest.entries[sharedEntryKey].ruleKey).toBe("shared-script");
  });

  test("can collect assets by source path, entry key, or emitted entry output", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle(createDiscoverConfig(root));
    const manifest = result.assetManifest!;
    const appEntryKey = result.entries["src/app.client.tsx"];

    const fromSource = collectAssetLinks(manifest, ["src/app.client.tsx"], {
      from: "source",
    });
    const fromEntryKey = collectAssetLinks(manifest, [appEntryKey], {
      from: "entryKey",
    });
    const fromOutput = collectAssetLinks(manifest, ["src/app.client.js"], {
      from: "entryOutput",
    });

    expect(fromSource.scripts).toEqual(["src/app.client.js"]);
    expect(fromEntryKey.scripts).toEqual(["src/app.client.js"]);
    expect(fromOutput.scripts).toEqual(["src/app.client.js"]);
  });
});
