import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { writeFrontendConfig, writeFrontendPackageFixture } from "./fixture.mjs";

const WATCH_TIMEOUT_MS = 30000;
const workspaceConfigDir = `.${String.fromCharCode(116, 114, 101, 98, 105, 114, 101, 100)}`;

function tokensSource(brand) {
  return `export const brand = "${brand}";\n`;
}

async function readCssOutput(outDir) {
  const entries = await fs.readdir(outDir, { recursive: true, withFileTypes: true });
  const cssEntry = entries.find((entry) => entry.isFile() && entry.name.endsWith(".css"));
  assert.ok(cssEntry, "expected a CSS output");
  return await fs.readFile(path.join(cssEntry.parentPath || cssEntry.path, cssEntry.name), "utf8");
}

async function waitForCss(outDir, expected) {
  const deadline = Date.now() + WATCH_TIMEOUT_MS;
  let last = "";
  for (;;) {
    try {
      last = await readCssOutput(outDir);
      if (last.includes(expected)) return last;
    } catch {}
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${expected} in watched config CSS\n${last}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function verifyFrontendConfigTokenWatch(context) {
  const fixture = path.join(context.tempRoot, "frontend-config-tokens");
  const outDir = path.join(fixture, "dist-tokens");
  await writeFrontendPackageFixture(fixture);
  const configDir = path.join(fixture, workspaceConfigDir, "frontend");
  const tokensPath = path.join(configDir, "tokens.ts");
  await writeFrontendConfig(path.join(configDir, "config.ts"), {
      flash: true,
      modal: true,
      prefix: "tok",
      token: "#111111",
  });
  await fs.writeFile(tokensPath, tokensSource("#aabbcc"));

  const session = await context.watch({
      format: "esm",
      outDir: "dist-tokens",
      rootDir: fixture,
  });
  try {
    const initial = await readCssOutput(outDir);
    assert.ok(initial.includes("--tok-color-brand: #aabbcc;"), "expected token source to drive generated CSS");

    await fs.writeFile(tokensPath, tokensSource("#ddeeff"));
    const watched = await waitForCss(outDir, "--tok-color-brand: #ddeeff;");
    assert.equal(watched.includes("#aabbcc"), false);

    const rebuilt = await context.readFirstCss((await session.rebuild()).outputs);
    assert.ok(rebuilt.includes("--tok-color-brand: #ddeeff;"));
  } finally {
    await session.dispose();
  }
}

export { verifyFrontendConfigTokenWatch };
