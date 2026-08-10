import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import {
  bundle,
  createBundlerNamespace,
  collectAssetLinks,
  collectRelatedEntries,
  collectRelatedFrontendEntries,
  createFrontendEntryRules,
  findBundlerProjectConfig,
  DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS,
  loadBundlerProjectConfig,
  normalizeBundlerPrefix,
  watch,
} from "../../dist/index.js";
import {
  verifyFrontendConfigStyles,
  verifyFrontendConfigWatchRebuild,
} from "./bundler/frontend-config-styles.mjs";
import { verifyBundlerProjectConfig } from "./bundler/project-config.mjs";
import { verifyFrontendConfigTokenWatch } from "./bundler/frontend/tokens.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = path.join(rootDir, ".tmp", "verify-bundler");

async function main() {
  await resetTempRoot();
  await verifyAggregateModuleMap();
  await verifyOutputLayoutAndPrecompression();
  await verifyScssPackageExports();
  await verifyBundlerProjectConfig({
    createBundlerNamespace,
    findBundlerProjectConfig,
    loadBundlerProjectConfig,
    normalizeBundlerPrefix,
    tempRoot,
    writeFile,
  });
  await verifyFrontendConfigStyles({ bundle, readFirstCss, tempRoot });
  await verifyFrontendConfigWatchRebuild({ readFirstCss, tempRoot, watch });
  await verifyFrontendConfigTokenWatch({ readFirstCss, tempRoot, watch });
  await verifyRelatedEntries();
  verifyFrontendConventions();
  console.log("Bundler feature verification succeeded.");
}

async function verifyAggregateModuleMap() {
  const fixture = path.join(tempRoot, "aggregate");
  await writeFile(fixture, "src/pages/root.ts", "export default 'root';\n");
  await writeFile(fixture, "src/pages/home.ts", "export default 'home';\n");
  await writeFile(fixture, "src/pages/settings/index.ts", "export default 'settings';\n");

  const result = await bundle({
    discover: {
      dir: "src/pages",
      rules: [createModuleMapRule()],
    },
    format: "esm",
    outDir: "dist",
    rootDir: fixture,
  });

  const output = await importFirstJs(result.outputs);
  assert.equal(output.rootModule, "root");
  assert.equal(output.modules.home, "home");
  assert.equal(output.modules.settings, "settings");
  assert.equal(output.getModule("settings"), "settings");
  assert.equal(output.default.modules.home, "home");
}

function createModuleMapRule() {
  return {
    key: "ssr-map",
    include: ["**/*.ts"],
    exclude: ["root.ts"],
    strategy: "aggregate",
    aggregate: {
      kind: "module-map",
      rootModule: "root.ts",
      collapseIndex: true,
      exports: {
        default: true,
        map: "modules",
        resolver: "getModule",
        root: "rootModule",
      },
    },
  };
}

async function verifyOutputLayoutAndPrecompression() {
  const fixture = path.join(tempRoot, "layout");
  await writeLayoutFixture(fixture);
  const result = await bundle({
    discover: {
      dir: "src",
      rules: [
        { key: "client", include: ["**/*.client.ts"], strategy: "entry" },
        { key: "style", include: ["**/*.client.css"], strategy: "entry" },
        { key: "ignore", include: ["**/*.svg"], strategy: "ignore" },
      ],
    },
    format: "esm",
    manifest: true,
    outDir: "dist",
    outputLayout: {
      asset: "assets/[path][ext]",
      css: "css/[path][ext]",
      js: "js/[path][ext]",
      map: "maps/[path][ext]",
    },
    precompress: { minSize: 1 },
    publicPath: "/static/",
    rootDir: fixture,
    sourcemap: "external",
  });

  assert.ok(result.outputLayout?.moved.some((item) => item.to.startsWith("js/")));
  assert.ok(result.precompressed?.assets.some((item) => item.format === "br"));
  assert.ok(result.precompressed?.assets.some((item) => item.format === "gzip"));
  await assertOutputLayoutFiles(result, fixture);
  await assertWrittenManifest(result, fixture);
}

async function writeLayoutFixture(fixture) {
  await writeFile(fixture, "src/app.client.ts", [
    "import './style.client.css';",
    "export const answer = 42;",
    "export async function loadValue() {",
    "  return import('./lazy.client').then((mod) => mod.value);",
    "}",
    "",
  ].join("\n"));
  await writeFile(fixture, "src/lazy.client.ts", "export const value = 'lazy';\n");
  await writeFile(fixture, "src/style.client.css", ".button { background: url('./icon.svg'); color: red; }\n");
  await writeFile(fixture, "src/icon.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");
}

async function assertOutputLayoutFiles(result, fixture) {
  const relOutputs = result.outputs.map((item) => toOutRel(fixture, item));
  assert.ok(relOutputs.some((item) => item.startsWith("js/") && item.endsWith(".js")));
  assert.ok(relOutputs.some((item) => item.startsWith("css/") && item.endsWith(".css")));
  assert.ok(relOutputs.some((item) => item.startsWith("maps/") && item.endsWith(".map")));
  assert.ok(relOutputs.every((item) => !item.startsWith("src/")));
  assert.ok(result.assetManifest.entries["entry:client:src/app.client"].js.every((item) => item.startsWith("js/")));
  assert.ok(result.assetManifest.entries["entry:style:src/style.client"].css.every((item) => item.startsWith("css/")));
  const links = collectAssetLinks(result.assetManifest, ["src/app.client.ts"], { from: "source", publicPath: "/static/" });
  assert.ok(links.scripts.every((item) => item.startsWith("/static/js/")));
  const cssOutput = result.outputs.find((item) => item.endsWith(".css"));
  assert.ok(cssOutput, "expected CSS output");
  const css = await fs.readFile(cssOutput, "utf8");
  assert.match(css, /url\(["']?\/static\/assets\/icon-[A-Z0-9]+\.svg["']?\)/u);
  assert.equal(css.includes("/static/assets/assets/"), false);
  assert.equal(css.includes("/static/../assets/"), false);
}

async function assertWrittenManifest(result, fixture) {
  const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8"));
  assert.ok(manifest.outputLayout.moved.length > 0);
  assert.ok(manifest.precompressed.assets.length > 0);
  assert.ok(Object.keys(manifest.assetManifest.outputs).every((item) => !item.startsWith("src/")));
  for (const compressed of result.precompressed.assets) {
    await fs.access(path.join(fixture, "dist", compressed.output));
  }
}

async function verifyScssPackageExports() {
  const fixture = path.join(tempRoot, "scss-package-exports");
  await writeScssPackageFixture(fixture);

  const result = await bundle({
    discover: {
      dir: "src",
      rules: [
        { key: "style", include: ["**/*.client.scss"], strategy: "entry" },
      ],
    },
    format: "esm",
    outDir: "dist",
    rootDir: fixture,
  });

  const cssOutput = result.outputs.find((item) => item.endsWith(".css"));
  assert.ok(cssOutput, "expected bundled SCSS CSS output");
  const css = await fs.readFile(cssOutput, "utf8");
  assert.equal(css.includes("--package-accent"), true);
  assert.equal(css.includes(".package-card"), true);
  assert.equal(css.includes(".screen"), true);
}

async function writeScssPackageFixture(fixture) {
  const packageRoot = path.join(fixture, "node_modules", "@scope", "style-kit");
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, "package.json"), JSON.stringify({
    name: "@scope/style-kit",
    exports: {
      "./card/styles": {
        sass: "./src/card/styles/index.scss",
        style: "./src/card/styles/index.scss",
      },
      "./tokens": {
        sass: "./src/tokens.scss",
      },
    },
  }, null, 2));
  await writeFile(fixture, "node_modules/@scope/style-kit/src/tokens.scss", [
    ":root {",
    "  --package-accent: black;",
    "}",
    "",
  ].join("\n"));
  await writeFile(fixture, "node_modules/@scope/style-kit/src/card/styles/index.scss", [
    "@mixin card-surface {",
    "  border-color: var(--package-accent);",
    "}",
    "",
    ".package-card {",
    "  color: var(--package-accent);",
    "}",
    "",
  ].join("\n"));
  await writeFile(fixture, "src/screen.client.scss", [
    '@use "@scope/style-kit/tokens";',
    '@use "@scope/style-kit/card/styles" as card;',
    "",
    ".screen {",
    "  @include card.card-surface;",
    "}",
    "",
  ].join("\n"));
}

async function verifyRelatedEntries() {
  const fixture = path.join(tempRoot, "related");
  await writeRelatedFixture(fixture);
  const generic = await collectRelatedEntries({
    candidatePatterns: ["[path].client.tsx", "[path].client.defer.ts", "[path].client.scss"],
    rootDir: fixture,
    sources: "src/pages/home.tsx",
    tsconfig: true,
  });
  const frontend = await collectRelatedFrontendEntries({
    rootDir: fixture,
    sources: "src/pages/home.tsx",
    tsconfig: true,
  });

  assert.deepEqual(generic.entries, [
    "src/features/card.client.scss",
    "src/pages/home.client.defer.ts",
    "src/pages/home.client.tsx",
  ]);
  assert.equal(frontend.entries.includes("src/pages/home.client.defer.ts"), true);
}

async function writeRelatedFixture(fixture) {
  await writeFile(fixture, "tsconfig.json", JSON.stringify({
    compilerOptions: {
      baseUrl: ".",
      paths: { "#feature/*": ["src/features/*"] },
    },
  }, null, 2));
  await writeFile(fixture, "src/pages/home.tsx", "import '#feature/card';\nexport default 'home';\n");
  await writeFile(fixture, "src/pages/home.client.tsx", "export const client = true;\n");
  await writeFile(fixture, "src/pages/home.client.defer.ts", "export const deferred = true;\n");
  await writeFile(fixture, "src/features/card.ts", "export const card = true;\n");
  await writeFile(fixture, "src/features/card.client.scss", ".card { color: red; }\n");
}

function verifyFrontendConventions() {
  const rules = createFrontendEntryRules();
  assert.deepEqual(rules[0].include, [...DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS]);
  assert.deepEqual(rules[1].include, [...DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS]);
  assert.equal(DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS.includes("**/*.defer.ts"), false);
}

async function importFirstJs(outputs) {
  const outputPath = outputs.find((item) => item.endsWith(".js"));
  assert.ok(outputPath, "expected JavaScript output");
  return import(`${pathToFileURL(outputPath).href}?v=${Date.now()}-${Math.random()}`);
}

async function readFirstCss(outputs) {
  const outputPath = outputs.find((item) => item.endsWith(".css"));
  assert.ok(outputPath, "expected CSS output");
  return await fs.readFile(outputPath, "utf8");
}

async function writeFile(root, rel, contents) {
  const filePath = path.join(root, rel);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

function toOutRel(fixture, outputPath) {
  return outputPath.replace(path.join(fixture, "dist") + path.sep, "").replace(/\\/gu, "/");
}

async function resetTempRoot() {
  await fs.rm(tempRoot, { force: true, recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
}

await main();
