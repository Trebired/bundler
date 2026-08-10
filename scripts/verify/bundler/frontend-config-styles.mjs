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
