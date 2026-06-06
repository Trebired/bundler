import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

import { bundle, deriveManifest, watch } from "../../src/index";
import { createFixtureProject, exists, readFile, tempDir, waitFor, writeFile } from "./helpers";

describe("@trebired/bundler", () => {
  test("builds mixed tsx, scss, and css entry graphs", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle({
      annotateSources: true,
      entries: {
        app: "./src/app.tsx",
        theme: "./src/theme.css",
      },
      outDir: "./dist",
      rootDir: root,
    });

    expect(result.outputs.some((filePath) => filePath.endsWith("/dist/app.js"))).toBe(true);
    expect(result.outputs.some((filePath) => filePath.endsWith("/dist/app.css"))).toBe(true);
    expect(result.outputs.some((filePath) => filePath.endsWith("/dist/theme.css"))).toBe(true);

    const appJs = readFile(root, "dist/app.js");
    const appCss = readFile(root, "dist/app.css");
    const themeCss = readFile(root, "dist/theme.css");

    expect(appJs).toContain("source: src/app.tsx");
    expect(appJs).toContain("source: src/lib/message.ts");
    expect(appJs).toContain("hello-bundle");
    expect(appCss).toContain("source: src/styles/site.scss");
    expect(appCss).toContain(".app");
    expect(themeCss).toContain('@charset "UTF-8";');
    expect(themeCss).toContain("source: src/theme.css");
  });

  test("minifies and strips comments by default", async () => {
    const root = tempDir();
    createFixtureProject(root);

    await bundle({
      entries: {
        app: "./src/app.tsx",
        theme: "./src/theme.css",
      },
      outDir: "./dist",
      rootDir: root,
    });

    const appJs = readFile(root, "dist/app.js");
    const appCss = readFile(root, "dist/app.css");
    const themeCss = readFile(root, "dist/theme.css");

    expect(appJs).not.toContain("app entry comment");
    expect(appJs).not.toContain("message comment");
    expect(appJs).not.toContain("\n\n");
    expect(appCss).not.toContain("site stylesheet comment");
    expect(themeCss).not.toContain("theme stylesheet comment");
    expect(themeCss).not.toContain("source:");
  });

  test("uses extreme mode for denser output while keeping stable entry names", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const debugResult = await bundle({
      entries: {
        app: "./src/app.tsx",
      },
      mode: "debug",
      outDir: "./dist-debug",
      rootDir: root,
    });

    const extremeResult = await bundle({
      entries: {
        app: "./src/app.tsx",
      },
      mode: "extreme",
      outDir: "./dist-extreme",
      rootDir: root,
    });

    const debugJsPath = debugResult.outputs.find((filePath) => filePath.endsWith("/dist-debug/app.js"));
    const extremeJsPath = extremeResult.outputs.find((filePath) => filePath.endsWith(".js") && !filePath.endsWith(".js.map"));

    expect(debugJsPath).toBeDefined();
    expect(extremeJsPath).toBeDefined();
    expect(extremeJsPath).toBe(path.join(root, "dist-extreme/app.js"));
    expect(fs.readFileSync(extremeJsPath!, "utf8").length).toBeLessThan(fs.readFileSync(debugJsPath!, "utf8").length);
  });

  test("keeps css and class string usage unchanged in extreme mode", async () => {
    const root = tempDir();
    createFixtureProject(root);

    writeFile(root, "src/client.ts", `
import "./styles/site.scss";

document.body.className = "app";
document.body.classList.add("app");
document.querySelector(".app");
`);

    const result = await bundle({
      entries: {
        client: "./src/client.ts",
      },
      mode: "extreme",
      outDir: "./dist",
      rootDir: root,
    });

    const jsPath = result.outputs.find((filePath) => filePath.endsWith(".js") && !filePath.endsWith(".js.map"));
    const cssPath = result.outputs.find((filePath) => filePath.endsWith(".css") && !filePath.endsWith(".css.map"));

    expect(jsPath).toBeDefined();
    expect(cssPath).toBeDefined();

    const js = fs.readFileSync(jsPath!, "utf8");
    const css = fs.readFileSync(cssPath!, "utf8");

    expect(css).toContain(".app");
    expect(js).toContain("\"app\"");
    expect(js).toContain("\".app\"");
  });

  test("omits source annotations when annotateSources is disabled", async () => {
    const root = tempDir();
    createFixtureProject(root);

    await bundle({
      annotateSources: false,
      entries: {
        app: "./src/app.tsx",
        theme: "./src/theme.css",
      },
      outDir: "./dist",
      rootDir: root,
    });

    expect(readFile(root, "dist/app.js")).not.toContain("source:");
    expect(readFile(root, "dist/app.css")).not.toContain("source:");
    expect(readFile(root, "dist/theme.css")).not.toContain("source:");
  });

  test("writes external source maps for css and scss when enabled", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle({
      entries: {
        app: "./src/app.tsx",
        theme: "./src/theme.css",
      },
      outDir: "./dist",
      rootDir: root,
      sourcemap: "external",
    });

    expect(result.outputs.some((filePath) => filePath.endsWith("/dist/app.js.map"))).toBe(true);
    expect(result.outputs.some((filePath) => filePath.endsWith("/dist/app.css.map"))).toBe(true);
    expect(result.outputs.some((filePath) => filePath.endsWith("/dist/theme.css.map"))).toBe(true);
    expect(exists(root, "dist/app.js.map")).toBe(true);
    expect(exists(root, "dist/app.css.map")).toBe(true);
    expect(exists(root, "dist/theme.css.map")).toBe(true);
  });

  test("does not write source maps when sourcemap is disabled", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle({
      entries: {
        app: "./src/app.tsx",
        theme: "./src/theme.css",
      },
      outDir: "./dist",
      rootDir: root,
      sourcemap: false,
    });

    expect(result.outputs.some((filePath) => filePath.endsWith(".map"))).toBe(false);
    expect(exists(root, "dist/app.js.map")).toBe(false);
    expect(exists(root, "dist/app.css.map")).toBe(false);
    expect(exists(root, "dist/theme.css.map")).toBe(false);
  });

  test("rebuilds in watch mode and disposes cleanly", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const session = await watch({
      annotateSources: true,
      entries: {
        app: "./src/app.tsx",
      },
      outDir: "./dist",
      rootDir: root,
    });

    writeFile(root, "src/lib/message.ts", `
export const message = "watch-updated";
`);

    const rebuild = await session.rebuild();

    expect(rebuild.outputs.some((filePath) => filePath.endsWith("/dist/app.js"))).toBe(true);
    expect(readFile(root, "dist/app.js")).toContain("watch-updated");

    await session.dispose();
  });

  test("supports event-sink and custom adapter logger forms", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const sinkRows: Array<{ group: string; level: string; message: string; metadata?: unknown }> = [];

    await bundle({
      entries: {
        app: "./src/app.tsx",
      },
      logger(event) {
        sinkRows.push(event);
      },
      outDir: "./dist-sink",
      rootDir: root,
    });

    expect(sinkRows.some((row) => row.group === "bundler.initialize" && row.level === "success")).toBe(true);
    expect(sinkRows.find((row) => row.group === "bundler.initialize")?.metadata).toBeUndefined();
    expect(sinkRows.some((row) => row.group === "bundler.build" && row.message === "start")).toBe(true);

    const adapterRows: Array<{ severity: string; line: string }> = [];

    await bundle({
      entries: {
        app: "./src/app.tsx",
      },
      logger: adapterRows,
      loggerAdapter(logger, event) {
        logger.push({
          line: `${event.group} :: ${event.message}`,
          severity: event.level,
        });
      },
      outDir: "./dist-adapter",
      rootDir: root,
    } as any);

    expect(adapterRows.some((row) => row.severity === "success" && row.line.includes("bundler.initialize :: @trebired/bundler initialized"))).toBe(true);
    expect(adapterRows.some((row) => row.severity === "info" && row.line.includes("bundler.build :: complete :: outputs="))).toBe(true);
  });

  test("bundles discovered scripts and styles together when they fit under the size limit", async () => {
    const root = tempDir();

    writeFile(root, "src/app.tsx", `
export const view = <main>standalone-tsx-entry</main>;
`);

    writeFile(root, "src/scripts/alpha.ts", `
console.log("alpha");
`);

    writeFile(root, "src/scripts/nested/bravo.js", `
console.log("bravo");
`);

    writeFile(root, "src/styles/alpha.css", `
.alpha { color: red; }
`);

    writeFile(root, "src/styles/nested/bravo.scss", `
.bravo { color: blue; }
`);

    const result = await bundle({
      discover: {
        dir: "./src",
        include: ["**/*.tsx", "**/*.ts", "**/*.js", "**/*.css", "**/*.scss"],
        maxBundleSize: "50mb",
      },
      outDir: "./dist",
      rootDir: root,
    });

    const outputNames = result.outputs.map((filePath) => path.basename(filePath)).sort();
    const scriptBundles = outputNames.filter((name) => /^bundle-[a-z0-9]+(?:-\d+)?\.js$/.test(name));
    const styleBundles = outputNames.filter((name) => /^bundle-[a-z0-9]+(?:-\d+)?\.css$/.test(name));

    expect(outputNames).toContain("app.js");
    expect(scriptBundles).toHaveLength(1);
    expect(styleBundles).toHaveLength(1);
    expect(readFile(root, `dist/${scriptBundles[0]}`)).toContain("alpha");
    expect(readFile(root, `dist/${scriptBundles[0]}`)).toContain("bravo");
    expect(readFile(root, `dist/${styleBundles[0]}`)).toContain(".alpha");
    expect(readFile(root, `dist/${styleBundles[0]}`)).toContain(".bravo");
  });

  test("splits discovered grouped bundles when they exceed the size limit", async () => {
    const root = tempDir();

    writeFile(root, "src/app.tsx", `
export const view = <main>standalone-tsx-entry</main>;
`);

    writeFile(root, "src/scripts/alpha.ts", `
console.log("alpha-${"x".repeat(80)}");
`);

    writeFile(root, "src/scripts/nested/bravo.js", `
console.log("bravo-${"y".repeat(80)}");
`);

    writeFile(root, "src/styles/alpha.css", `
.alpha { color: red; }
/* ${"a".repeat(120)} */
`);

    writeFile(root, "src/styles/nested/bravo.scss", `
.bravo { color: blue; }
/* ${"b".repeat(120)} */
`);

    const result = await bundle({
      discover: {
        dir: "./src",
        include: ["**/*.tsx", "**/*.ts", "**/*.js", "**/*.css", "**/*.scss"],
        maxBundleSize: 200,
      },
      outDir: "./dist",
      rootDir: root,
    });

    const outputNames = result.outputs.map((filePath) => path.basename(filePath)).sort();
    const scriptBundles = outputNames.filter((name) => /^bundle-[a-z0-9]+(?:-\d+)?\.js$/.test(name));
    const styleBundles = outputNames.filter((name) => /^bundle-[a-z0-9]+(?:-\d+)?\.css$/.test(name));

    expect(outputNames).toContain("app.js");
    expect(scriptBundles.length).toBe(2);
    expect(styleBundles.length).toBe(2);
    expect(scriptBundles.every((name) => name.startsWith("bundle-"))).toBe(true);
    expect(styleBundles.every((name) => name.startsWith("bundle-"))).toBe(true);
    expect(scriptBundles.some((name) => readFile(root, `dist/${name}`).includes("alpha-"))).toBe(true);
    expect(scriptBundles.some((name) => readFile(root, `dist/${name}`).includes("bravo-"))).toBe(true);
    expect(styleBundles.some((name) => readFile(root, `dist/${name}`).includes(".alpha"))).toBe(true);
    expect(styleBundles.some((name) => readFile(root, `dist/${name}`).includes(".bravo"))).toBe(true);
  });

  test("fails when a discovered grouped file is larger than the max size", async () => {
    const root = tempDir();

    writeFile(root, "src/styles/oversized.scss", `
.oversized { color: red; }
/* ${"z".repeat(256)} */
`);

    await expect(bundle({
      discover: {
        dir: "./src",
        include: ["**/*.scss"],
        maxBundleSize: 64,
      },
      outDir: "./dist",
      rootDir: root,
    })).rejects.toThrow("bundler-discover-bundle-file-too-large :: src/styles/oversized.scss");
  });

  test("prunes duplicate entry paths and keeps the first highest-priority entry", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const sinkRows: Array<{ group: string; level: string; message: string; metadata?: Record<string, unknown> }> = [];

    const result = await bundle({
      entries: {
        app: "./src/app.tsx",
        "app-copy": "./src/app.tsx",
      },
      logger(event) {
        sinkRows.push(event as typeof sinkRows[number]);
      },
      outDir: "./dist",
      rootDir: root,
    });

    expect(result.entries).toEqual({
      app: "src/app.tsx",
    });
    expect(result.outputs.some((filePath) => filePath.endsWith("/dist/app.js"))).toBe(true);
    expect(result.outputs.some((filePath) => filePath.endsWith("/dist/app-copy.js"))).toBe(false);

    const duplicateLog = sinkRows.find((row) => row.group === "bundler.entries" && row.message === "duplicate-entry-pruned");
    expect(duplicateLog?.level).toBe("warn");
    expect(duplicateLog?.metadata).toMatchObject({
      dropped_entry: "app-copy",
      dropped_path: "src/app.tsx",
      kept_entry: "app",
      kept_path: "src/app.tsx",
    });
  });

  test("discovers entry files and writes a manifest", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle({
      discover: {
        dir: "./src",
        include: ["app.tsx", "theme.css"],
      },
      manifest: true,
      outDir: "./dist",
      rootDir: root,
    });

    const entryNames = Object.keys(result.entries).sort();
    const styleEntryName = entryNames.find((value) => value.startsWith("bundle-"));

    expect(entryNames).toContain("app");
    expect(styleEntryName).toBeDefined();
    expect(result.entries.app).toBe("src/app.tsx");
    expect(result.entries[styleEntryName!]).toBe(`virtual:${styleEntryName}`);
    expect(result.manifestPath?.endsWith("/dist/bundler-manifest.json")).toBe(true);

    const manifest = JSON.parse(readFile(root, "dist/bundler-manifest.json"));
    expect(manifest.resolvedEntries.app.path).toBe("src/app.tsx");
    expect(manifest.resolvedEntries.app.source).toBe("discover");
    expect(manifest.resolvedEntries[styleEntryName!]).toEqual({
      path: `virtual:${styleEntryName}`,
      source: "virtual",
    });
    expect(manifest.entries["dist/app.js"].entryOutput).toBe("dist/app.js");
    expect(manifest.entries["dist/app.js"].css).toContain("dist/app.css");
    expect(Object.keys(manifest.entries).some((key) => /^dist\/bundle-[a-z0-9]+\.css$/.test(key))).toBe(true);
  });

  test("watch mode picks up new discovered entry files", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const session = await watch({
      discover: {
        dir: "./src/pages",
        include: ["**/*.tsx"],
      },
      manifest: true,
      outDir: "./dist",
      rootDir: root,
    });

    expect(exists(root, "dist/home.js")).toBe(false);

    writeFile(root, "src/pages/home.tsx", `
export const page = "home";
console.log(page);
`);

    await waitFor(() => exists(root, "dist/home.js"));
    await waitFor(() => readFile(root, "dist/bundler-manifest.json").includes("\"home\""));

    expect(readFile(root, "dist/home.js")).toContain("home");

    await session.dispose();
  });

  test("builds virtual entries and exposes them in the result map", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle({
      entries: {
        app: "./src/app.tsx",
      },
      virtualEntries: {
        "entry-server": `
import { message } from "./src/lib/message";
export const rendered = message.toUpperCase();
console.log(rendered);
`,
        "global.client": `
import "./src/styles/site.scss";
console.log("global-client");
`,
      },
      outDir: "./dist",
      rootDir: root,
    });

    expect(result.entries).toEqual({
      app: "src/app.tsx",
      "entry-server": "virtual:entry-server",
      "global.client": "virtual:global.client",
    });
    expect(readFile(root, "dist/entry-server.js")).toContain("toUpperCase");
    expect(readFile(root, "dist/global.client.js")).toContain("global-client");
    expect(readFile(root, "dist/global.client.css")).toContain(".app");
  });

  test("keeps rich class-bearing strings intact in extreme mode", async () => {
    const root = tempDir();
    createFixtureProject(root);

    writeFile(root, "src/styles/patterns.scss", `
.select-card { display: flex; }
.inline-row { display: flex; }
.gap-sm { gap: 8px; }
.ver-center { align-items: center; }
.column { display: flex; flex-direction: column; }
.gap-xs { gap: 4px; }
.flex-1 { flex: 1; }
.pill { border-radius: 999px; }
.loader-circle { border-radius: 999px; }
`);

    writeFile(root, "src/patterns.tsx", `
import "./styles/patterns.scss";

const tone = "tone-info";
const progressClass = true ? "loader-circle" : "select-card";
const html = "<div class=\\"select-card inline-row gap-sm ver-center\\"></div>";
const htmlTemplate = \`<span class="pill \${tone} loader-circle"></span>\`;
const stackedClassName = ["column", "gap-xs", "flex-1"].filter(Boolean).join(" ");

document.body.className = "select-card loader-circle";
document.body.setAttribute("class", "inline-row gap-sm");
document.querySelector(".select-card");

export const view = (
  <div
    className="select-card inline-row gap-sm ver-center"
    data-stacked={stackedClassName}
    data-progress={progressClass}
    data-html={html}
    data-template={htmlTemplate}
  />
);
`);

    const result = await bundle({
      entries: {
        patterns: "./src/patterns.tsx",
      },
      mode: "extreme",
      outDir: "./dist",
      rootDir: root,
    });

    const jsPath = result.outputs.find((filePath) => filePath.endsWith(".js") && !filePath.endsWith(".js.map"));
    const cssPath = result.outputs.find((filePath) => filePath.endsWith(".css") && !filePath.endsWith(".css.map"));

    expect(jsPath).toBeDefined();
    expect(cssPath).toBeDefined();

    const js = fs.readFileSync(jsPath!, "utf8");
    const css = fs.readFileSync(cssPath!, "utf8");

    expect(css).toContain(".select-card");
    expect(css).toContain(".loader-circle");
    expect(js).toContain("select-card");
    expect(js).toContain("inline-row gap-sm ver-center");
    expect(js).toContain("\"column\",\"gap-xs\",\"flex-1\"");
    expect(js).toContain("loader-circle");
    expect(js).toContain('class="pill ');
  });

  test("fails when virtual and manual entries collide on the same name", async () => {
    const root = tempDir();
    createFixtureProject(root);

    await expect(bundle({
      entries: {
        app: "./src/app.tsx",
      },
      virtualEntries: {
        app: `console.log("duplicate");`,
      },
      outDir: "./dist",
      rootDir: root,
    })).rejects.toThrow("bundler-entry-name-conflict :: app");
  });

  test("derives a stable manifest graph from the esbuild metafile", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const result = await bundle({
      entries: {
        app: "./src/app.tsx",
        theme: "./src/theme.css",
      },
      outDir: "./dist",
      rootDir: root,
    });

    const manifest = deriveManifest(result.metafile!, {
      outDir: path.join(root, "dist"),
      rootDir: root,
    });

    expect(manifest.entries["dist/app.js"].js).toContain("dist/app.js");
    expect(manifest.entries["dist/app.js"].css).toContain("dist/app.css");
    expect(manifest.entries["dist/theme.css"].css).toContain("dist/theme.css");
    expect(manifest.allOutputs["dist/app.js"].kind).toBe("entry");
  });

  test("watch hooks run after rebuilds and entry-set changes", async () => {
    const root = tempDir();
    createFixtureProject(root);

    const sequence: string[] = [];

    const session = await watch({
      discover: {
        dir: "./src/pages",
        include: ["**/*.tsx"],
      },
      outDir: "./dist",
      rootDir: root,
      async onEntrySetChanged(entries) {
        sequence.push(`entry:${Object.keys(entries).join(",")}`);
      },
      async onRebuilt(result) {
        sequence.push(`rebuilt:${result.outputs.length}`);
      },
      virtualEntries: {
        bootstrap: `console.log("bootstrap");`,
      },
    });

    writeFile(root, "src/pages/home.tsx", `
export const page = "home";
console.log(page);
`);

    await waitFor(() => sequence.some((value) => value.startsWith("entry:")));
    await waitFor(() => exists(root, "dist/home.js"));

    expect(sequence.some((value) => value.includes("home"))).toBe(true);
    expect(exists(root, "dist/home.js")).toBe(true);

    await session.dispose();
  });

  test("watch rebuild rejects when lifecycle hooks fail", async () => {
    const root = tempDir();
    createFixtureProject(root);

    await expect(watch({
      entries: {
        app: "./src/app.tsx",
      },
      outDir: "./dist",
      rootDir: root,
      onRebuilt() {
        throw new Error("hook-boom");
      },
    })).rejects.toThrow("hook-boom");
  });
});
