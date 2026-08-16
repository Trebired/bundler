import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const workspaceConfigDir = `.${String.fromCharCode(116, 114, 101, 98, 105, 114, 101, 100)}`;
const bundlerConfigDir = `${workspaceConfigDir}/bundler`;
const i18nForVersion = "0.4.0";

async function verifyBundlerProjectConfig(context) {
  await verifyMissingAndEmptyConfig(context);
  const prefixed = await verifyPrefixedProjectConfig(context);
  verifyProjectMergeHelpers(context, prefixed);
  await verifyI18nProjectConfigMerge(context);
}

async function verifyMissingAndEmptyConfig(context) {
  const noConfig = path.join(context.tempRoot, "bundler-project-no-config");
  await fs.mkdir(noConfig, { recursive: true });
  const missing = await context.loadConfig(noConfig);
  assert.deepEqual(missing.config, emptyProjectConfig(context));
  assert.equal(missing.configPath, null);
  assert.deepEqual(missing.dependencies, []);
  assert.equal(context.createBundlerNamespace(missing.config).className("button"), "button");
  assert.equal(context.createBundlerNamespace(missing.config).cssVar("button-color"), "--button-color");
  assert.equal(context.createBundlerNamespace(missing.config).cssVarRef("button-color"), "var(--button-color)");
  assert.equal(context.createBundlerNamespace(missing.config).dataAttr("popover"), "data-popover");
  assert.equal(context.createBundlerNamespace(missing.config).eventName("upload-change"), "upload-change");
  await assert.rejects(
    () => context.loadConfig(noConfig, { defaultIfMissing: false }),
    /not found/u,
  );

  const emptyConfig = path.join(context.tempRoot, "bundler-project-empty-config");
  await context.writeFile(
    emptyConfig,
    `${bundlerConfigDir}/config.ts`,
    `export default { forVersion: '${context.packageVersion}' };\n`,
  );
  const empty = await context.loadConfig(emptyConfig);
  assert.deepEqual(empty.config, emptyProjectConfig(context));
  assert.equal(empty.dependencies.length, 1);
}

async function verifyPrefixedProjectConfig(context) {
  const prefixedConfig = path.join(context.tempRoot, "bundler-project-prefixed-config");
  await writePrefixedConfig(context, prefixedConfig);
  await context.writeFile(prefixedConfig, "src/nested/file.ts", "export const marker = true;\n");
  const configPath = await context.findConfig(path.join(prefixedConfig, "src", "nested"));
  assert.equal(configPath, path.join(prefixedConfig, bundlerConfigDir, "config.ts"));
  const prefixed = await context.loadConfig(prefixedConfig, {
      searchFrom: path.join(prefixedConfig, "src", "nested"),
  });
  const namespace = context.createBundlerNamespace(prefixed.config);
  assertPrefixedConfig(prefixed.config, context);
  assert.equal(namespace.className("button"), "tbf-button");
  assert.equal(namespace.elementClass("upload", "surface"), "tbf-upload__surface");
  assert.equal(namespace.modifierClass("button", "strong"), "tbf-button--strong");
  assert.equal(namespace.cssVar("button-color"), "--tbf-button-color");
  assert.equal(namespace.cssVarRef("button-color", "red"), "var(--tbf-button-color, red)");
  assert.equal(namespace.dataAttr("popover"), "data-tbf-popover");
  assert.deepEqual(namespace.dataAttrs({ popover: "", open: true }), {
      "data-tbf-open": true,
      "data-tbf-popover": "",
  });
  assert.equal(namespace.dataSelector("popover"), "[data-tbf-popover]");
  assert.equal(namespace.dataSelector("open", true), "[data-tbf-open=\"true\"]");
  assert.equal(namespace.token("router"), "tbf-router");
  assert.equal(namespace.eventName("upload-change"), "tbf:upload-change");
  await verifyGeneratedNamespaceModule(context, prefixedConfig);
  assert.equal(context.normalizeBundlerPrefix(".tbf"), "tbf");
  return { prefixed, prefixedConfig };
}

async function verifyGeneratedNamespaceModule(context, prefixedConfig) {
  const source = context.generateNamespaceModule({ prefix: "tbf" });
  assert.equal(source.includes("NAMESPACE_PREFIX = \"tbf\""), true);
  assert.equal(source.includes("function elementClass"), true);
  const outFile = await context.writeNamespaceModule({
      outFile: "src/generated/namespace.ts",
      rootDir: prefixedConfig,
  });
  const written = await fs.readFile(outFile, "utf8");
  assert.equal(written.includes("NAMESPACE_PREFIX = \"tbf\""), true);
}

async function writePrefixedConfig(context, prefixedConfig) {
  await context.writeFile(prefixedConfig, `${bundlerConfigDir}/config.ts`, [
      "export default {",
      `  forVersion: '${context.packageVersion}',`,
      "  build: { minify: false, publicPath: '/assets/' },",
      "  frontend: { frontendDir: 'ui', globalStyleRuleKey: 'styles' },",
      "  i18n: { supportedLanguages: ['en', 'cs'], dirName: 'messages' },",
      "  prefix: 'tbf',",
      "  staticAssets: { blockSourceMaps: false, devCacheControl: 'no-cache' },",
      "};",
      "",
    ].join("\n"));
}

function assertPrefixedConfig(config, context) {
  assert.deepEqual(config, {
      build: { minify: false, publicPath: "/assets/" },
      forVersion: context.packageVersion,
      frontend: { frontendDir: "ui", globalStyleRuleKey: "styles" },
      i18n: {
        dirName: "messages",
        supportedLanguages: ["en", "cs"],
      },
      prefix: "tbf",
      staticAssets: { blockSourceMaps: false, devCacheControl: "no-cache" },
  });
}

function verifyProjectMergeHelpers(context, { prefixed, prefixedConfig }) {
  const merged = context.applyProjectConfigToFrontendBundlerOptions({
      browser: { minify: true },
      clientOutDir: "dist/client",
      rootDir: prefixedConfig,
      ssrOutDir: "dist/ssr",
    }, prefixed.config);
  assert.equal(merged.frontendDir, "ui");
  assert.equal(merged.globalStyleRuleKey, "styles");
  assert.equal(merged.publicPath, "/assets/");
  assert.deepEqual(merged.supportedI18nLanguages, ["en", "cs"]);
  assert.equal(merged.browser.minify, true);
  assert.equal(merged.browser.publicPath, "/assets/");
  assert.equal(merged.browser.i18n.dirName, "messages");

  const staticOptions = context.applyProjectConfigToStaticAssetOptions({
      clientOutDir: "dist/client",
      mode: "development",
    }, prefixed.config);
  assert.equal(staticOptions.blockSourceMaps, false);
  assert.equal(staticOptions.devCacheControl, "no-cache");
}

async function verifyI18nProjectConfigMerge(context) {
  const i18nProject = path.join(context.tempRoot, "bundler-project-i18n-config");
  await context.writeFile(
    i18nProject,
    `${bundlerConfigDir}/config.ts`,
    `export default { forVersion: '${context.packageVersion}', build: { publicPath: '/project/' } };\n`,
  );
  await context.writeFile(i18nProject, `${workspaceConfigDir}/i18n/config.ts`, [
      "export default {",
      `  forVersion: '${i18nForVersion}',`,
      "  defaultLanguage: 'en',",
      "  supportedLanguages: ['en', 'cs'],",
      "  local: { dirName: 'messages', extensions: ['ts'] },",
      "};",
      "",
    ].join("\n"));
  const mergedFromProjectFiles = await context.applyProjectConfigsToFrontendBundlerOptions({
      clientOutDir: "dist/client",
      rootDir: i18nProject,
      ssrOutDir: "dist/ssr",
  });
  assert.equal(mergedFromProjectFiles.publicPath, "/project/");
  assert.deepEqual(mergedFromProjectFiles.supportedI18nLanguages, ["en", "cs"]);
  assert.equal(mergedFromProjectFiles.browser.i18n.dirName, "messages");
}

function emptyProjectConfig(context) {
  return {
    build: {},
    forVersion: context.packageVersion,
    frontend: {},
    i18n: undefined,
    prefix: "",
    staticAssets: {},
  };
}

export { verifyBundlerProjectConfig };
