import { afterEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileStringAsync } from "sass-embedded";

import { createScssAliasImporter, rewriteScssAliasDirectives } from "./imports.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

async function createProject(files: Record<string, string>): Promise<string> {
  const rootDir = await fs.mkdtemp(path.join(tmpdir(), "bundler-scss-alias-"));
  cleanupDirs.push(rootDir);

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents);
  }

  return rootDir;
}

async function compileScss(rootDir: string, source: string): Promise<string> {
  const importer = createScssAliasImporter(rootDir);
  const result = await compileStringAsync(rewriteScssAliasDirectives(source), {
    importers: [importer],
    loadPaths: [rootDir],
    style: "expanded",
    url: pathToFileURL(path.join(rootDir, "src", "entry.scss")),
  });

  return result.css;
}

test("resolves scss aliases from package imports", async () => {
  const rootDir = await createProject({
    "package.json": JSON.stringify({ imports: { "#palette": "./src/styles/_palette.scss" } }),
    "src/styles/_palette.scss": "$brand: #102030;",
  });

  const css = await compileScss(rootDir, '@use "#palette" as palette;\n.pkg { color: palette.$brand; }');

  expect(css).toContain("color: #102030;");
});

test("prefers code discipline alias-map shards over other alias sources", async () => {
  const rootDir = await createProject({
    ".code-discipline/generated/tsconfig.paths.json": JSON.stringify({
      compilerOptions: { paths: { "#palette": ["../../src/styles/_generated.scss"] } },
    }),
    ".code-discipline/imports/1.json": JSON.stringify({ "#palette": "./src/styles/_folder.scss" }),
    "package.json": JSON.stringify({ imports: { "#palette": "./src/styles/_package.scss" } }),
    "src/styles/_folder.scss": "$brand: #135724;",
    "src/styles/_generated.scss": "$brand: #246813;",
    "src/styles/_package.scss": "$brand: #abcdef;",
  });

  const css = await compileScss(rootDir, '@use "#palette" as *;\n.folder { color: $brand; }');

  expect(css).toContain("color: #135724;");
});

test("resolves generated tsconfig alias paths when folder shards are absent", async () => {
  const rootDir = await createProject({
    ".code-discipline/generated/tsconfig.paths.json": JSON.stringify({
      compilerOptions: { paths: { "#generated": ["../../src/styles/_generated.scss"] } },
    }),
    "src/styles/_generated.scss": "$brand: #224466;",
  });

  const css = await compileScss(rootDir, '@use "#generated" as generated;\n.fallback { color: generated.$brand; }');

  expect(css).toContain("color: #224466;");
});

test("resolves nested forwarded aliases from alias-map shards", async () => {
  const rootDir = await createProject({
    ".code-discipline/imports/1.json": JSON.stringify({
      "#theme": "./src/styles/_theme.scss",
      "#tokens": "./src/styles/_tokens.scss",
    }),
    "src/styles/_theme.scss": '@forward "#tokens";',
    "src/styles/_tokens.scss": "$tone: #335577;",
  });

  const css = await compileScss(rootDir, '@use "#theme" as theme;\n.nested { color: theme.$tone; }');

  expect(css).toContain("color: #335577;");
});
