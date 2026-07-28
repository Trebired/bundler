import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildFrontendApp,
  buildRelatedClientEntryMap,
  collectAggregateMatchedSourcesByRuleKey,
  collectFrontendAssetLinks,
  createAggregateSourceIdMap,
  createFrontendAppBundlerOptions,
  createFrontendBundlerRuntime,
  createFrontendBundlerRuntimeConfig,
  DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_GLOBAL_STYLE_PATTERNS,
  normalizeAggregateSourceId,
  resolveAggregateEntryByRuleKey,
  serveStaticAsset,
} from "../../dist/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = path.join(rootDir, ".tmp", "verify-frontend-app");

async function main() {
  await resetTempRoot();
  await verifyFrontendPresetDefaults();
  await verifyFrontendBuildHelpers();
  await verifyRelatedMapTsconfigResolution();
  console.log("Frontend app verification succeeded.");
}

async function verifyFrontendPresetDefaults() {
  const options = createFrontendAppBundlerOptions({
    clientOutDir: "dist/client",
    rootDir: tempRoot,
    ssrOutDir: "dist/ssr",
    supportedI18nLanguages: ["en", "cs"],
  });
  const clientRules = options.client.discover.rules;
  const ssrRules = options.ssr.discover.rules;

  assert.equal(options.client.environment, "browser");
  assert.equal(options.ssr.environment, "node");
  assert.equal(options.client.outputLayout, true);
  assert.equal(options.client.precompress, true);
  assert.deepEqual(clientRules[1].include, [...DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS]);
  assert.deepEqual(clientRules[2].include, [...DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS]);
  assert.deepEqual(clientRules[3].include, [...DEFAULT_FRONTEND_GLOBAL_STYLE_PATTERNS]);
  assert.equal(ssrRules[1].aggregate.requireMatchedModuleExport, true);
  assert.equal(DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS.includes("**/*.defer.ts"), false);
}

async function verifyFrontendBuildHelpers() {
  const fixture = path.join(tempRoot, "app");
  await writeFrontendFixture(fixture);
  const config = createBuildConfig(fixture);
  const result = await buildFrontendApp(config);

  assert.ok(result.stats.precompressed.assets.length > 0);
  assert.ok(toPosix(result.ssrEntryOutput).includes("dist/ssr/js/"));
  await assertAggregateMetadata(result);
  assertRelatedMap(result.relatedClientEntryMap);
  await assertRuntime(config);
  await assertAssetLinksAndStatic(result, fixture);
  await fs.access(path.join(fixture, "dist/client/robots.txt"));
}

function createBuildConfig(fixture) {
  return {
    browser: { precompress: { minSize: 1 }, sourcemap: "external" },
    clientOutDir: "dist/client",
    frontendDir: "src/frontend",
    mode: "production",
    publicPath: "/assets/",
    rootDir: fixture,
    ssr: {
      include: ["pages/**/*.tsx"],
      key: "ssr-pages",
      mapExport: "pages",
      requireMatchedModuleExport: true,
      resolverExport: "getPageComponent",
      rootExport: "rootDocument",
      rootModule: "layouts/root/document.tsx",
    },
    ssrOutDir: "dist/ssr",
  };
}

async function assertAggregateMetadata(result) {
  const entry = resolveAggregateEntryByRuleKey(result.ssr.assetManifest, "ssr-pages");
  const matched = collectAggregateMatchedSourcesByRuleKey(result.ssr.assetManifest, "ssr-pages");
  const sourceIds = createAggregateSourceIdMap(matched, { sourcePrefix: "src/frontend/pages" });
  const ssrModule = await importFresh(result.ssrEntryOutput);

  assert.ok(entry.aggregate.skippedSources.includes("src/frontend/pages/helper.tsx"));
  assert.ok(result.ssr.assetManifest.rules["ssr-pages"].aggregate.skippedSources.includes("src/frontend/pages/helper.tsx"));
  assert.equal(matched.includes("src/frontend/pages/helper.tsx"), false);
  assert.equal(sourceIds["src/frontend/pages/about/index.tsx"], "about");
  assert.equal(normalizeAggregateSourceId("src/frontend/pages/about/index.tsx", { sourcePrefix: "src/frontend/pages" }), "about");
  assert.equal(ssrModule.rootDocument, "root");
  assert.equal(ssrModule.pages.home, "home");
  assert.equal(ssrModule.pages.about, "about");
  assert.equal(ssrModule.pages.reexport, "reexported");
  assert.equal(ssrModule.getPageComponent("home"), "home");
  assert.equal(ssrModule.default.pages.reexport, "reexported");
}

function assertRelatedMap(map) {
  assert.deepEqual(map.home, [
    "src/frontend/features/card.client.scss",
    "src/frontend/pages/home.client.defer.ts",
    "src/frontend/pages/home.client.tsx",
  ]);
}

async function assertRuntime(config) {
  const runtime = createFrontendBundlerRuntime(createFrontendBundlerRuntimeConfig(config));
  await runtime.ensure();
  assert.equal(await runtime.resolveRootDocument(), "root");
  assert.equal(await runtime.resolvePageComponent("about"), "about");
  const links = await runtime.buildAssetLinks(["home"]);
  assert.ok(links.tags.html.includes("<link rel=\"stylesheet\""));
  assert.ok(links.tags.html.includes("<script type=\"module\""));
}

async function assertAssetLinksAndStatic(result, fixture) {
  const links = collectFrontendAssetLinks({
    collect: { publicPath: "/assets/" },
    globalStyleRuleKey: "global-style",
    manifest: result.client.assetManifest,
    pageIds: ["home"],
    relatedEntryMap: result.relatedClientEntryMap,
    renderTags: true,
  });
  const scriptOutput = result.client.assetManifest.entries[links.entryKeys.find((key) => result.client.assetManifest.entries[key].js.length)].file;
  const response = await serveStaticAsset({
    headers: { "accept-encoding": "gzip, br" },
    url: `/${scriptOutput}`,
  }, {
    clientOutDir: path.join(fixture, "dist/client"),
    mode: "production",
  });
  const privateResponse = await serveStaticAsset({ url: "/bundler-manifest.json" }, {
    clientOutDir: path.join(fixture, "dist/client"),
    mode: "production",
  });
  const sourceMap = Object.keys(result.client.assetManifest.outputs).find((item) => item.endsWith(".map"));
  assert.ok(sourceMap, "expected a source map output");
  const sourceMapResponse = await serveStaticAsset({ url: `/${sourceMap}` }, {
    clientOutDir: path.join(fixture, "dist/client"),
    mode: "production",
  });
  const publicResponse = await serveStaticAsset({ url: "/robots.txt" }, {
    clientOutDir: path.join(fixture, "dist/client"),
    mode: "development",
    publicDir: path.join(fixture, "src/frontend/public"),
  });

  assert.ok(links.styles.some((item) => item.startsWith("/assets/css/")));
  assert.ok(links.scripts.some((item) => item.startsWith("/assets/js/")));
  assert.equal(response.headers["Content-Encoding"], "br");
  assert.equal(response.headers.Vary, "Accept-Encoding");
  assert.equal(privateResponse.status, 404);
  assert.equal(sourceMapResponse.status, 404);
  assert.equal(publicResponse.body.toString(), "User-agent: *\n");
}

async function verifyRelatedMapTsconfigResolution() {
  const fixture = path.join(tempRoot, "alias");
  await writeTsconfigRelatedFixture(fixture);
  const map = await buildRelatedClientEntryMap({
    aggregateSources: ["src/frontend/pages/alias.tsx"],
    pageId: { sourcePrefix: "src/frontend/pages" },
    rootDir: fixture,
    tsconfig: true,
  });
  assert.deepEqual(map.alias, ["src/frontend/features/card.client.scss"]);
}

async function writeFrontendFixture(fixture) {
  await writeFile(fixture, "src/frontend/layouts/root/document.tsx", "export const rootDocument = 'root';\n");
  await writeFile(fixture, "src/frontend/pages/home.tsx", "import '../features/card';\nexport default 'home';\n");
  await writeFile(fixture, "src/frontend/pages/about/index.tsx", "const Page = 'about';\nexport { Page as default };\n");
  await writeFile(fixture, "src/frontend/pages/reexport.tsx", "export { default } from '../shared/reexported';\n");
  await writeFile(fixture, "src/frontend/pages/helper.tsx", "export const helper = true;\n");
  await writeFile(fixture, "src/frontend/pages/home.client.tsx", `export const hydrate = ${JSON.stringify("x".repeat(2048))};\n`);
  await writeFile(fixture, "src/frontend/pages/home.client.defer.ts", "export const deferred = true;\n");
  await writeFile(fixture, "src/frontend/features/card.ts", "export const card = true;\n");
  await writeFile(fixture, "src/frontend/features/card.client.scss", ".card { color: red; }\n");
  await writeFile(fixture, "src/frontend/shared/reexported.tsx", "export default 'reexported';\n");
  await writeFile(fixture, "src/frontend/css/base.css", `.base { content: "${"x".repeat(2048)}"; }\n`);
  await writeFile(fixture, "src/frontend/public/robots.txt", "User-agent: *\n");
}

async function writeTsconfigRelatedFixture(fixture) {
  await writeFile(fixture, "tsconfig.json", JSON.stringify({
    compilerOptions: {
      baseUrl: ".",
      paths: { "#feature/*": ["src/frontend/features/*"] },
    },
  }, null, 2));
  await writeFile(fixture, "src/frontend/pages/alias.tsx", "import '#feature/card';\nexport default 'alias';\n");
  await writeFile(fixture, "src/frontend/features/card.ts", "export const card = true;\n");
  await writeFile(fixture, "src/frontend/features/card.client.scss", ".card { color: blue; }\n");
}

async function importFresh(filePath) {
  assert.ok(filePath, "expected an SSR entry output");
  return import(`${pathToFileURL(filePath).href}?v=${Date.now()}-${Math.random()}`);
}

async function writeFile(root, rel, contents) {
  const filePath = path.join(root, rel);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

function toPosix(value) {
  return String(value || "").replace(/\\/gu, "/");
}

async function resetTempRoot() {
  await fs.rm(tempRoot, { force: true, recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
}

await main();
