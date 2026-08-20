import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { writeFrontendConfig, writeFrontendPackageFixture } from "./frontend/fixture.mjs";

const workspaceConfigDir = `.${String.fromCharCode(116, 114, 101, 98, 105, 114, 101, 100)}`;
const frontendConfigDir = `${workspaceConfigDir}/frontend`;

async function verifyFrontendConfigStyles(context) {
  const fixture = path.join(context.tempRoot, "frontend-config-styles");
  await writeFrontendPackageFixture(fixture);
  const configPath = path.join(fixture, frontendConfigDir, "config.ts");
  await writeFrontendConfig(configPath, {
      flash: true,
      modal: false,
      prefix: "app",
      token: "#123456",
  });

  const configured = await context.bundle({
      format: "esm",
      outDir: "dist-configured",
      rootDir: fixture,
  });
  const configuredCss = await context.readFirstCss(configured.outputs);
  assert.ok(configuredCss.includes("--app-color-brand: #123456;"));
  assert.ok(configuredCss.includes(".tbf-icon"));
  assert.ok(configuredCss.includes(".tbf-flash"));
  await assert.rejects(
    () => fs.access(path.join(fixture, frontendConfigDir, "generated", "styles.scss")),
    /ENOENT/u,
  );
  assert.equal(/^\.tbf-modal\b/mu.test(configuredCss), false);
  assertFrontendConfigFontLinks(context, configured);

  await fs.unlink(configPath);
  const defaults = await context.bundle({
      format: "esm",
      outDir: "dist-defaults",
      rootDir: fixture,
  });
  const defaultCss = await context.readFirstCss(defaults.outputs);
  assert.ok(defaultCss.includes("--tbf-icon-endpoint: \"/__icons/svg\";"));
  assert.ok(defaultCss.includes(".tbf-modal"));
}

function assertFrontendConfigFontLinks(context, result) {
  const rule = result.assetManifest.rules["frontend-config"];
  assert.ok(rule?.entryKeys?.length, "expected frontend config rule entry");
  const entry = result.assetManifest.entries[rule.entryKeys[0]];
  assert.ok(entry, "expected frontend config asset manifest entry");
  assert.ok(entry.css.some((item) => item.endsWith(".css")));
  assert.ok(entry.assets.some((item) => item.endsWith(".woff2")));

  const links = context.collectAssetLinks(result.assetManifest, ["frontend-config"], {
      from: "ruleKey",
      publicPath: "/",
  });
  const rendered = context.renderAssetLinkTags(links);
  const frontendLinks = context.collectFrontendAssetLinks({
      collect: { publicPath: "/" },
      manifest: result.assetManifest,
      renderTags: true,
  });

  assert.ok(links.fontPreloads.some((item) => item.href.endsWith(".woff2")));
  assert.ok(rendered.fontPreloads.includes('type="font/woff2"'));
  assert.ok(frontendLinks.fontPreloads.some((item) => item.href.endsWith(".woff2")));
  assert.ok(frontendLinks.tags.fontPreloads.includes('rel="preload"'));
  assertFrontendCssOrder(context);
}

function assertFrontendCssOrder(context) {
  const links = collectFrontendCssOrderLinks(context, createFrontendCssOrderManifest());

  assert.deepEqual(links.styles, [
      "/css/frontend.css",
      "/css/bundle-app.css",
      "/css/client.css",
      "/css/page.css",
  ]);
  assert.equal(links.styles.filter((href) => href === "/css/frontend.css").length, 1);
  assert.ok(
    links.tags.styles.indexOf('href="/css/frontend.css"') <
    links.tags.styles.indexOf('href="/css/bundle-app.css"'),
  );
}

function createFrontendCssOrderManifest() {
  return {
    entries: {
      "frontend-config:styles": frontendEntry("frontend-config:styles", "frontend-config", ["css/frontend.css"]),
      "app-global": frontendEntry("app-global", "global-style", ["css/bundle-app.css"]),
      "app-client": frontendEntry("app-client", "global-client", ["css/client.css"]),
      "page-client": frontendEntry("page-client", "page", ["css/page.css"]),
      "shared-duplicate": frontendEntry("shared-duplicate", "page", ["css/frontend.css"]),
    },
    entryOutputs: {},
    outputs: {},
    rules: {
      "frontend-config": {
        entryKeys: ["frontend-config:styles"],
        ignoredSources: [],
        ruleKey: "frontend-config",
        strategy: "entry",
      },
      "global-style": {
        entryKeys: ["app-global"],
        ignoredSources: [],
        ruleKey: "global-style",
        strategy: "bundle",
      },
    },
    sources: {
      "src/frontend/pages/home.tsx": {
        entryKey: "page-client",
        outputs: [],
        ruleKey: "page",
        source: "src/frontend/pages/home.tsx",
        strategy: "entry",
      },
      "src/frontend/shared/duplicate.ts": {
        entryKey: "shared-duplicate",
        outputs: [],
        ruleKey: "page",
        source: "src/frontend/shared/duplicate.ts",
        strategy: "entry",
      },
    },
  };
}

function collectFrontendCssOrderLinks(context, manifest) {
  return context.collectFrontendAssetLinks({
      collect: { publicPath: "/" },
      globalEntryIds: ["app-client"],
      globalStyleRuleKey: "global-style",
      manifest,
      pageIds: ["src/frontend/pages/home.tsx", "src/frontend/shared/duplicate.ts"],
      relatedEntryMap: createFrontendCssOrderRelatedMap(),
      renderTags: true,
  });
}

function createFrontendCssOrderRelatedMap() {
  return {
    "src/frontend/pages/home.tsx": ["src/frontend/pages/home.tsx"],
    "src/frontend/shared/duplicate.ts": ["src/frontend/shared/duplicate.ts"],
  };
}

function frontendEntry(key, ruleKey, css) {
  return {
    assets: [],
    css,
    entryOutput: `${key}.js`,
    file: `${key}.js`,
    generated: false,
    imports: [],
    js: [],
    key,
    kind: "entry",
    outputs: css,
    ruleKey,
    sources: [],
    strategy: "entry",
  };
}

async function verifyFrontendConfigWatchRebuild(context) {
  const fixture = path.join(context.tempRoot, "frontend-config-watch");
  await writeFrontendPackageFixture(fixture);
  const configPath = path.join(fixture, frontendConfigDir, "config.ts");
  await writeFrontendConfig(configPath, {
      flash: true,
      modal: true,
      prefix: "watch",
      token: "#334455",
  });

  const session = await context.watch({
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
    const css = await context.readFirstCss(rebuilt.outputs);
    assert.ok(css.includes("--watch2-color-brand: #667788;"));
    assert.equal(css.includes(".tbf-flash"), false);
    assert.ok(css.includes(".tbf-modal"));
  } finally {
    await session.dispose();
  }
}

export { verifyFrontendConfigStyles, verifyFrontendConfigWatchRebuild };
