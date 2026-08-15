import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFrontendApp,
  buildRelatedClientEntryMap,
  collectAggregateMatchedSourcesByRuleKey,
  collectFrontendAssetLinks,
  createAggregateSourceIdMap,
  createFrontendAppBundlerOptions,
  createFrontendBundlerRuntime,
  createFrontendBundlerRuntimeConfig,
  createFrontendBundlerRuntimeSession,
  DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_GLOBAL_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_GLOBAL_STYLE_PATTERNS,
  DEFAULT_FRONTEND_SSR_PAGE_PATTERNS,
  normalizeAggregateSourceId,
  resolveAggregateEntryByRuleKey,
  serveStaticAsset,
} from "../../../dist/index.js";
import {
  importJavaScriptOutput,
  resetTemporaryRoot,
  toPosixPathValue,
  writeFixtureFile,
} from "#0ss24zzupv8u";
import { verifyDevelopmentRuntimeReusesInitialWatchBuild } from "./app-i18n.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tempRoot = path.join(rootDir, ".tmp", "verify-frontend-app");

async function verifyFrontendAppPackage() {
  await resetTemporaryRoot(tempRoot);
  await verifyFrontendPresetDefaults();
  await verifyFrontendBuildHelpers();
  await verifyTargetSpecificBuilds();
  await verifyRuntimeNodeModules();
  await verifyBuildOnceRuntimeSession();
  await verifyDevelopmentRuntimeReusesInitialWatchBuild(tempRoot);
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
  assert.equal(options.config.globalClientEntries, "auto");
  assert.deepEqual(options.config.globalClientEntryInclude, [...DEFAULT_FRONTEND_GLOBAL_CLIENT_ENTRY_PATTERNS]);
  assert.equal(ssrRules[1].key, "ssr-pages");
  assert.deepEqual(ssrRules[1].include, [...DEFAULT_FRONTEND_SSR_PAGE_PATTERNS]);
  assert.equal(ssrRules[1].aggregate.exports.map, "modules");
  assert.equal(ssrRules[1].aggregate.exports.resolver, "getModule");
  assert.equal(ssrRules[1].aggregate.exports.root, "rootModule");
  assert.equal(ssrRules[1].aggregate.requireMatchedModuleExport, true);
  assert.equal(DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS.includes("**/*.defer.ts"), false);
}

async function verifyFrontendBuildHelpers() {
  const fixture = path.join(tempRoot, "app");
  await writeFrontendFixture(fixture);
  const config = createBuildConfig(fixture);
  const result = await buildFrontendApp(config);

  assert.ok(result.stats.precompressed.assets.length > 0);
  assert.ok(toPosixPathValue(result.ssrEntryOutput).includes("dist/ssr/js/"));
  assert.ok(result.globalClientEntries.includes("src/frontend/js/global.client.ts"));
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
      mapExport: "pages",
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
  const ssrModule = await importJavaScriptOutput([result.ssrEntryOutput]);

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
  assert.deepEqual(map.about, []);
}

async function assertRuntime(config) {
  const runtime = createFrontendBundlerRuntime(createFrontendBundlerRuntimeConfig(config));
  assert.throws(() => runtime.resolveRootDocumentSync(), /bundler-frontend-runtime-not-ensured/u);
  assert.throws(() => runtime.resolvePageComponentSync("about"), /bundler-frontend-runtime-not-ensured/u);
  assert.throws(() => runtime.buildAssetLinksSync(["home"]), /bundler-frontend-runtime-not-ensured/u);
  await runtime.ensure();
  assert.equal(await runtime.resolveRootDocument(), "root");
  assert.equal(await runtime.resolvePageComponent("about"), "about");
  assert.equal(runtime.resolveRootDocumentSync(), "root");
  assert.equal(runtime.resolvePageComponentSync("about"), "about");
  assert.ok(runtime.getRuntime().globalClientEntries.includes("src/frontend/js/global.client.ts"));
  const links = await runtime.buildAssetLinks(["home"]);
  assert.ok(links.tags.html.includes("<link rel=\"stylesheet\""));
  assert.ok(links.tags.html.includes("<script type=\"module\""));
  assert.ok(runtime.buildAssetLinksSync(["home"]).scripts.some((item) => item.startsWith("/assets/js/")));
}

async function assertAssetLinksAndStatic(result, fixture) {
  const links = collectFrontendAssetLinks({
      collect: { publicPath: "/assets/" },
      globalEntryIds: result.globalClientEntries,
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
      clientOutDir: "dist/client",
      mode: "development",
      publicDir: "src/frontend/public",
      rootDir: fixture,
  });

  assert.ok(links.styles.some((item) => item.startsWith("/assets/css/")));
  assert.ok(links.scripts.some((item) => item.startsWith("/assets/js/")));
  assert.ok(links.entryKeys.some((key) => key.includes("src/frontend/js/global.client")));
  assert.equal(response.headers["Content-Encoding"], "br");
  assert.equal(response.headers.Vary, "Accept-Encoding");
  assert.equal(privateResponse.status, 404);
  assert.equal(sourceMapResponse.status, 404);
  assert.equal(publicResponse.body.toString(), "User-agent: *\n");
}

async function verifyTargetSpecificBuilds() {
  const clientFixture = path.join(tempRoot, "target-client");
  await writeFrontendFixture(clientFixture);
  const clientOnly = await buildFrontendApp({ ...createBuildConfig(clientFixture), target: "client" });

  assert.ok(clientOnly.client);
  assert.equal(clientOnly.ssr, undefined);
  assert.equal(clientOnly.ssrEntryOutput, undefined);
  assert.equal(clientOnly.publicDirCopied, true);
  assert.ok(clientOnly.globalClientEntries.includes("src/frontend/js/global.client.ts"));

  const ssrFixture = path.join(tempRoot, "target-ssr");
  await writeFrontendFixture(ssrFixture);
  const ssrOnly = await buildFrontendApp({ ...createBuildConfig(ssrFixture), target: "ssr" });

  assert.equal(ssrOnly.client, undefined);
  assert.ok(ssrOnly.ssr);
  assert.ok(ssrOnly.ssrEntryOutput);
  assert.equal(ssrOnly.publicDirCopied, false);
  assert.deepEqual(ssrOnly.globalClientEntries, []);
}

async function verifyRuntimeNodeModules() {
  const fixture = path.join(tempRoot, "runtime-node-modules");
  await writeNodeModulesFixture(fixture);
  const config = {
    clientOutDir: "dist/client",
    frontendDir: "src/frontend",
    mode: "production",
    node: { external: ["runtime-value"] },
    nodeModules: { force: true, sourceDir: "runtime_node_modules", strategy: "copy" },
    rootDir: fixture,
    ssr: {
      rootExport: "rootDocument",
      rootModule: "layouts/root/document.tsx",
    },
    ssrOutDir: "dist/ssr",
  };

  await buildFrontendApp({ ...config, target: "ssr" });
  await fs.rm(path.join(fixture, "dist/ssr/node_modules"), { force: true, recursive: true });
  const productionRuntime = createFrontendBundlerRuntime(createFrontendBundlerRuntimeConfig(config));
  await productionRuntime.ensure();
  assert.equal(await productionRuntime.resolvePageComponent("home"), "runtime-value");
  await fs.access(path.join(fixture, "dist/ssr/node_modules/runtime-value/index.js"));

  const devConfig = { ...config, clientOutDir: "dev/client", mode: "development", ssrOutDir: "dev/ssr" };
  const developmentRuntime = createFrontendBundlerRuntime(createFrontendBundlerRuntimeConfig(devConfig));
  try {
    await developmentRuntime.ensure();
    await fs.rm(path.join(fixture, "dev/ssr/node_modules"), { force: true, recursive: true });
    await developmentRuntime.ensure();
    assert.equal(developmentRuntime.resolvePageComponentSync("home"), "runtime-value");
    await fs.access(path.join(fixture, "dev/ssr/node_modules/runtime-value/index.js"));
  } finally {
    await developmentRuntime.dispose();
  }
}

async function verifyBuildOnceRuntimeSession() {
  const fixture = path.join(tempRoot, "runtime-session");
  await writeFrontendFixture(fixture);
  const session = await createFrontendBundlerRuntimeSession({
      ...createBuildConfig(fixture),
      clientOutDir: "dev/client",
      mode: "development",
      ssrOutDir: "dev/ssr",
    }, {
      developmentStrategy: "build",
  });

  assert.equal(session.mode, "development");
  assert.ok(session.buildResult.client);
  assert.equal(session.runtime.resolveRootDocumentSync(), "root");
  assert.equal(session.runtime.resolvePageComponentSync("about"), "about");
  assert.ok(session.clientDistAbs.endsWith("dev/client"));
  await fs.access(path.join(fixture, "dev/client/bundler-manifest.json"));
  await session.runtime.dispose();
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
  await writeFixtureFile(fixture, "src/frontend/layouts/root/document.tsx", "export const rootDocument = 'root';\n");
  await writeFixtureFile(fixture, "src/frontend/pages/home.tsx", "import '../features/card';\nexport default 'home';\n");
  await writeFixtureFile(fixture, "src/frontend/pages/about/index.tsx", "const Page = 'about';\nexport { Page as default };\n");
  await writeFixtureFile(fixture, "src/frontend/pages/reexport.tsx", "export { default } from '../shared/reexported';\n");
  await writeFixtureFile(fixture, "src/frontend/pages/helper.tsx", "export const helper = true;\n");
  await writeFixtureFile(fixture, "src/frontend/pages/home.client.tsx", `export const hydrate = ${JSON.stringify("x".repeat(2048))};\n`);
  await writeFixtureFile(fixture, "src/frontend/pages/home.client.defer.ts", "export const deferred = true;\n");
  await writeFixtureFile(fixture, "src/frontend/features/card.ts", "export const card = true;\n");
  await writeFixtureFile(fixture, "src/frontend/features/card.client.scss", ".card { color: red; }\n");
  await writeFixtureFile(fixture, "src/frontend/js/global.client.ts", `export const global = ${JSON.stringify("x".repeat(2048))};\n`);
  await writeFixtureFile(fixture, "src/frontend/shared/reexported.tsx", "export default 'reexported';\n");
  await writeFixtureFile(fixture, "src/frontend/css/base.css", `.base { content: "${"x".repeat(2048)}"; }\n`);
  await writeFixtureFile(fixture, "src/frontend/public/robots.txt", "User-agent: *\n");
}

async function writeNodeModulesFixture(fixture) {
  await writeFixtureFile(fixture, "src/frontend/layouts/root/document.tsx", "export const rootDocument = 'root';\n");
  await writeFixtureFile(fixture, "src/frontend/pages/home.tsx", "import value from 'runtime-value';\nexport default value;\n");
  await writeFixtureFile(fixture, "src/frontend/js/global.client.ts", "export const global = true;\n");
  await writeFixtureFile(fixture, "runtime_node_modules/runtime-value/index.js", "export default 'runtime-value';\n");
  await writeFixtureFile(fixture, "runtime_node_modules/runtime-value/package.json", JSON.stringify({
        exports: "./index.js",
        type: "module",
  }));
}

async function writeTsconfigRelatedFixture(fixture) {
  await writeFixtureFile(fixture, "tsconfig.json", JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "#feature/*": ["src/frontend/features/*"] },
        },
      }, null, 2));
  await writeFixtureFile(fixture, "src/frontend/pages/alias.tsx", "import '#feature/card';\nexport default 'alias';\n");
  await writeFixtureFile(fixture, "src/frontend/features/card.ts", "export const card = true;\n");
  await writeFixtureFile(fixture, "src/frontend/features/card.client.scss", ".card { color: blue; }\n");
}

await verifyFrontendAppPackage();
