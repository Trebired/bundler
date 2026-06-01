import { describe, expect, test } from "bun:test";

import { bundle, watch } from "../../src/index";
import { createFixtureProject, exists, readFile, tempDir, writeFile } from "./helpers";

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

    expect(appJs).toContain("@trebired/source: src/app.tsx");
    expect(appJs).toContain("@trebired/source: src/lib/message.ts");
    expect(appJs).toContain("hello-bundle");
    expect(appCss).toContain("@trebired/source: src/styles/site.scss");
    expect(appCss).toContain("color: blue;");
    expect(themeCss).toContain('@charset "UTF-8";');
    expect(themeCss).toContain("@trebired/source: src/theme.css");
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

    expect(readFile(root, "dist/app.js")).not.toContain("@trebired/source:");
    expect(readFile(root, "dist/app.css")).not.toContain("@trebired/source:");
    expect(readFile(root, "dist/theme.css")).not.toContain("@trebired/source:");
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
});
