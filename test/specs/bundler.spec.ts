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

  test("uses extreme mode for denser and obfuscated output", async () => {
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
    expect(extremeJsPath?.endsWith("/dist-extreme/app.js")).toBe(false);
    expect(path.basename(extremeJsPath!)).toMatch(/^[A-Z0-9]+\.[a-z]+$/);
    expect(fs.readFileSync(extremeJsPath!, "utf8").length).toBeLessThan(fs.readFileSync(debugJsPath!, "utf8").length);
  });

  test("rewrites js and tsx class usage to the same obfuscated css class names", async () => {
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
    const cssClassMatch = css.match(/\.([a-z][a-z0-9]*)/i);

    expect(css).not.toContain(".app");
    expect(js).not.toContain("\"app\"");
    expect(js).not.toContain(".app");
    expect(cssClassMatch?.[1]).toBeDefined();
    expect(js).toContain(`"${cssClassMatch![1]}"`);
    expect(js).toContain(`".${cssClassMatch![1]}"`);
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
    expect(sinkRows.some((row) => row.group === "build" && row.message === "start")).toBe(true);

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
    expect(adapterRows.some((row) => row.severity === "info" && row.line.includes("build :: complete :: outputs="))).toBe(true);
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

    expect(result.entries).toEqual({
      app: "src/app.tsx",
      theme: "src/theme.css",
    });
    expect(result.manifestPath?.endsWith("/dist/bundler-manifest.json")).toBe(true);

    const manifest = JSON.parse(readFile(root, "dist/bundler-manifest.json"));
    expect(manifest.resolvedEntries.app.path).toBe("src/app.tsx");
    expect(manifest.resolvedEntries.app.source).toBe("discover");
    expect(manifest.entries["dist/app.js"].entryOutput).toBe("dist/app.js");
    expect(manifest.entries["dist/app.js"].css).toContain("dist/app.css");
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

  test("supports explicit obfuscation options", async () => {
    const root = tempDir();
    createFixtureProject(root);

    writeFile(root, "src/props.ts", `
const model = { _secretValue: "secret" };
console.log(model._secretValue);
`);

    const result = await bundle({
      entries: {
        props: "./src/props.ts",
      },
      obfuscate: {
        entryNames: "x/[hash]",
        mangleProps: "^_",
      },
      outDir: "./dist",
      rootDir: root,
    });

    const jsPath = result.outputs.find((filePath) => filePath.endsWith(".js") && !filePath.endsWith(".js.map"));
    expect(jsPath?.includes("/dist/x/")).toBe(true);
    expect(fs.readFileSync(jsPath!, "utf8")).not.toContain("_secretValue");
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
