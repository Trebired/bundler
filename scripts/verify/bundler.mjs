import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import {
  bundle,
  collectAssetLinks,
  collectRelatedEntries,
  collectRelatedFrontendEntries,
  createFrontendEntryRules,
  DEFAULT_FRONTEND_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_PATTERNS,
  watch,
} from "../../dist/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = path.join(rootDir, ".tmp", "verify-bundler");

async function main() {
  await resetTempRoot();
  await verifyAggregateModuleMap();
  await verifyOutputLayoutAndPrecompression();
  await verifyScssPackageExports();
  await verifyFrontendConfigStyles();
  await verifyFrontendConfigWatchRebuild();
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

async function verifyFrontendConfigStyles() {
  const fixture = path.join(tempRoot, "frontend-config-styles");
  await writeFrontendPackageFixture(fixture);
  const configPath = path.join(fixture, ".trebired/frontend/config.ts");
  await writeFrontendConfig(configPath, {
    flash: true,
    modal: false,
    prefix: "app",
    token: "#123456",
  });

  const configured = await bundle({
    format: "esm",
    outDir: "dist-configured",
    rootDir: fixture,
  });
  const configuredCss = await readFirstCss(configured.outputs);
  const configuredScss = await fs.readFile(path.join(fixture, ".trebired/frontend/generated/styles.scss"), "utf8");
  assert.ok(configuredCss.includes("--app-color-brand: #123456;"));
  assert.ok(configuredCss.includes(".tbf-icon"));
  assert.ok(configuredCss.includes(".tbf-flash"));
  assert.equal(configuredScss.includes('@use "@trebired/frontend/modal/styles"'), false);
  assert.equal(/^\.tbf-modal\b/mu.test(configuredCss), false);

  await fs.unlink(configPath);
  const defaults = await bundle({
    format: "esm",
    outDir: "dist-defaults",
    rootDir: fixture,
  });
  const defaultCss = await readFirstCss(defaults.outputs);
  assert.ok(defaultCss.includes("--tbf-icon-endpoint: \"/__icons/svg\";"));
  assert.ok(defaultCss.includes(".tbf-modal"));
}

async function verifyFrontendConfigWatchRebuild() {
  const fixture = path.join(tempRoot, "frontend-config-watch");
  await writeFrontendPackageFixture(fixture);
  const configPath = path.join(fixture, ".trebired/frontend/config.ts");
  await writeFrontendConfig(configPath, {
    flash: true,
    modal: true,
    prefix: "watch",
    token: "#334455",
  });

  const session = await watch({
    format: "esm",
    outDir: "dist-watch",
    rootDir: fixture,
  });
  try {
    await writeFrontendConfig(configPath, {
      flash: false,
      modal: true,
      prefix: "watch2",
      token: "#667788",
    });
    const rebuilt = await session.rebuild();
    const css = await readFirstCss(rebuilt.outputs);
    assert.ok(css.includes("--watch2-color-brand: #667788;"));
    assert.equal(css.includes(".tbf-flash"), false);
    assert.ok(css.includes(".tbf-modal"));
  } finally {
    await session.dispose();
  }
}

async function writeFrontendPackageFixture(fixture) {
  const packageName = `@${organizationName()}/frontend`;
  const packageRoot = path.join(fixture, "node_modules", ...packageName.split("/"));
  await fs.mkdir(fixture, { recursive: true });
  await fs.writeFile(path.join(fixture, "package.json"), JSON.stringify({
    dependencies: {
      [packageName]: "0.0.0-fixture",
    },
    private: true,
    type: "module",
  }, null, 2));
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, "package.json"), JSON.stringify({
    exports: {
      "./config": {
        import: "./config/index.js",
      },
      "./flash/styles": {
        sass: "./dist/flash/styles/index.scss",
        style: "./dist/flash/styles/index.scss",
      },
      "./icons/styles": {
        sass: "./dist/icons/styles/index.scss",
        style: "./dist/icons/styles/index.scss",
      },
      "./modal/styles": {
        sass: "./dist/modal/styles/index.scss",
        style: "./dist/modal/styles/index.scss",
      },
      "./styles/tokens": {
        sass: "./dist/styles/tokens.scss",
        style: "./dist/styles/tokens.scss",
      },
      "./styles/utils": {
        sass: "./dist/styles/utils.scss",
        style: "./dist/styles/utils.scss",
      },
    },
    name: packageName,
    type: "module",
    version: "0.0.0-fixture",
  }, null, 2));
  await writeFile(packageRoot, "dist/styles/tokens.scss", ":root { --tbf-radius: 0; }\n");
  await writeFile(packageRoot, "dist/styles/utils.scss", ".inline-row { display: inline-flex; }\n");
  await writeFile(packageRoot, "dist/icons/styles/index.scss", ".tbf-icon { color: currentColor; }\n");
  await writeFile(packageRoot, "dist/flash/styles/index.scss", ".tbf-flash { color: black; }\n");
  await writeFile(packageRoot, "dist/modal/styles/index.scss", ".tbf-modal { display: block; }\n");
  await writeFile(packageRoot, "config/index.js", frontendConfigFixtureModule());
}

function frontendConfigFixtureModule() {
  return [
    "import fs from 'node:fs/promises';",
    "import path from 'node:path';",
    "",
    "const configRel = '.trebired/frontend/config.ts';",
    "const generatedRel = '.trebired/frontend/generated/styles.scss';",
    "",
    "export function defineTrebiredFrontendConfig(config) {",
    "  return config;",
    "}",
    "",
    "async function exists(filePath) {",
    "  try {",
    "    await fs.access(filePath);",
    "    return true;",
    "  } catch {",
    "    return false;",
    "  }",
    "}",
    "",
    "function parseConfigText(text) {",
    "  return {",
    "    prefix: /prefix:\\s*[\"']([^\"']+)/u.exec(text)?.[1] || 'tbf',",
    "    systems: {",
    "      flash: !/flash:\\s*false/u.test(text),",
    "      icons: !/icons:\\s*false/u.test(text),",
    "      modal: !/modal:\\s*false/u.test(text),",
    "    },",
    "    token: /brand:\\s*[\"']([^\"']+)/u.exec(text)?.[1] || null,",
    "  };",
    "}",
    "",
    "export async function loadTrebiredFrontendConfig(rootDir = process.cwd()) {",
    "  const configPath = path.join(rootDir, configRel);",
    "  const found = await exists(configPath);",
    "  const config = found ? parseConfigText(await fs.readFile(configPath, 'utf8')) : {",
    "    prefix: 'tbf',",
    "    systems: { flash: true, icons: true, modal: true },",
    "    token: null,",
    "  };",
    "  return {",
    "    config,",
    "    configPath: found ? configPath : null,",
    "    generatedScssPath: path.join(rootDir, generatedRel),",
    "  };",
    "}",
    "",
    "export async function writeGeneratedTrebiredFrontendScss(rootDir, config) {",
    "  const outputPath = path.join(rootDir, generatedRel);",
    "  const lines = [",
    "    '@use \"@trebired/frontend/styles/tokens\" as *;',",
    "    '@use \"@trebired/frontend/styles/utils\" as *;',",
    "  ];",
    "  if (config.systems.icons) lines.push('@use \"@trebired/frontend/icons/styles\" as *;');",
    "  if (config.systems.flash) lines.push('@use \"@trebired/frontend/flash/styles\" as *;');",
    "  if (config.systems.modal) lines.push('@use \"@trebired/frontend/modal/styles\" as *;');",
    "  lines.push('', ':root {', `  --${config.prefix}-icon-endpoint: \"/__icons/svg\";`);",
    "  if (config.token) lines.push(`  --${config.prefix}-color-brand: ${config.token};`);",
    "  lines.push('}', '');",
    "  await fs.mkdir(path.dirname(outputPath), { recursive: true });",
    "  await fs.writeFile(outputPath, lines.join('\\n'));",
    "  return outputPath;",
    "}",
    "",
  ].join("\n");
}

async function writeFrontendConfig(configPath, options) {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, [
    `import { defineTrebiredFrontendConfig } from "@${organizationName()}/frontend/config";`,
    "",
    "export default defineTrebiredFrontendConfig({",
    `  prefix: "${options.prefix}",`,
    "  icons: { packs: [\"remixicon\", \"simple-icons\"], endpoint: \"/icons/svg\" },",
    "  systems: {",
    `    flash: ${options.flash},`,
    "    icons: true,",
    `    modal: ${options.modal},`,
    "  },",
    `  theme: { cssVariables: true, tokens: { color: { brand: "${options.token}" } } },`,
    "});",
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

function organizationName() {
  return String.fromCharCode(116, 114, 101, 98, 105, 114, 101, 100);
}

async function resetTempRoot() {
  await fs.rm(tempRoot, { force: true, recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
}

await main();
