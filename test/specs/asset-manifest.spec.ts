import { describe, expect, test } from "bun:test";

import { buildAssetManifest, bundle, collectAssetLinks } from "../../src/index";
import { createFixtureProject, readFile, tempDir } from "./helpers";

describe("asset manifest helpers", () => {
  test("exposes a runtime-friendly asset manifest on build results", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle({
      entries: {
        app: "./src/app.tsx",
        theme: "./src/theme.css",
      },
      manifest: true,
      outDir: "./dist",
      rootDir: root,
    });

    expect(result.assetManifest).toBeDefined();
    expect(result.assetManifest?.entryNames.app).toBe("src/app.tsx");
    expect(result.assetManifest?.entryNames.theme).toBe("src/theme.css");
    expect(result.assetManifest?.entryOutputs["app.js"]).toBe("src/app.tsx");
    expect(result.assetManifest?.entries["src/app.tsx"].file).toBe("app.js");
    expect(result.assetManifest?.entries["src/app.tsx"].css).toContain("app.css");
    expect(result.assetManifest?.entries["src/theme.css"].file).toBe("theme.css");

    const manifest = buildAssetManifest({
      metafile: result.metafile!,
      outDir: "./dist",
      rootDir: root,
      resolvedEntries: result.entries,
    });

    expect(manifest).toEqual(result.assetManifest);

    const links = collectAssetLinks(manifest, ["app", "src/theme.css"], {
      publicPath: "/",
    });

    expect(links.entryKeys).toEqual(["src/app.tsx", "src/theme.css"]);
    expect(links.scripts).toEqual(["/app.js"]);
    expect(links.styles).toEqual(["/app.css", "/theme.css"]);
    expect(links.outputs).toEqual(["/app.css", "/app.js", "/theme.css"]);
    expect(links.missing).toEqual([]);

    const writtenManifest = JSON.parse(readFile(root, "dist/bundler-manifest.json"));
    expect(writtenManifest.assetManifest.entryNames.app).toBe("src/app.tsx");
    expect(writtenManifest.assetManifest.entries["src/app.tsx"].file).toBe("app.js");
  });

  test("can collect assets by source path or emitted output", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle({
      entries: {
        app: "./src/app.tsx",
      },
      outDir: "./dist",
      rootDir: root,
    });

    const manifest = result.assetManifest!;
    const fromSource = collectAssetLinks(manifest, ["src/app.tsx"], {
      from: "entrySource",
    });
    const fromOutput = collectAssetLinks(manifest, ["app.js"], {
      from: "entryOutput",
    });

    expect(fromSource.scripts).toEqual(["app.js"]);
    expect(fromSource.styles).toEqual(["app.css"]);
    expect(fromOutput.scripts).toEqual(["app.js"]);
    expect(fromOutput.styles).toEqual(["app.css"]);
  });
});
