import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  createFrontendBundlerRuntime,
  createFrontendBundlerRuntimeConfig,
} from "../../../dist/index.js";
import {
  createCaptureLogger,
  organizationName,
  writeFixtureFile,
} from "#0ss24zzupv8u";

async function verifyDevelopmentRuntimeReusesInitialWatchBuild(tempRoot) {
  const fixture = path.join(tempRoot, "runtime-watch-i18n");
  await writeDevelopmentI18nFixture(fixture);
  const capture = createCaptureLogger();
  const runtime = createFrontendBundlerRuntime(createFrontendBundlerRuntimeConfig({
        clientOutDir: "dev/client",
        frontendDir: "src/frontend",
        logger: capture.logger,
        mode: "development",
        rootDir: fixture,
        ssr: {
          rootExport: "rootDocument",
          rootModule: "layouts/root/document.tsx",
        },
        ssrOutDir: "dev/ssr",
        supportedI18nLanguages: ["en", "cs"],
  }));

  try {
    await runtime.ensure();
    await runtime.ensure();
  } finally {
    await runtime.dispose();
  }

  assertDevelopmentI18nSummaries(capture.events);
}

function assertDevelopmentI18nSummaries(events) {
  const summaries = events.filter((event) => event.message === "local translators summary");
  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries.map((event) => event.metadata?.target).sort(), ["client", "ssr"]);
  assert.deepEqual(summaries.map((event) => event.metadata?.environment).sort(), ["browser", "node"]);
}

async function writeDevelopmentI18nFixture(fixture) {
  const packageName = `@${organizationName()}/i18n`;
  await writeI18nStub(fixture, packageName);
  await writeFixtureFile(fixture, "src/frontend/layouts/root/document.tsx", "export const rootDocument = 'root';\n");
  await writeFrontendI18nEntries(fixture, packageName);
  await writeFrontendI18nMessages(fixture, packageName);
}

async function writeFrontendI18nEntries(fixture, packageName) {
  await writeFixtureFile(fixture, "src/frontend/pages/home.tsx", [
      `import { createLocalTranslator } from ${JSON.stringify(packageName)};`,
      "",
      "export default function home() {",
      "  const t = createLocalTranslator(import.meta.url, 'en');",
      "  return t('title');",
      "}",
      "",
    ].join("\n"));
  await writeFixtureFile(fixture, "src/frontend/pages/home.client.tsx", [
      `import { createLocalTranslator } from ${JSON.stringify(packageName)};`,
      "",
      "export function hydrate(language) {",
      "  const t = createLocalTranslator(import.meta.url, language);",
      "  return t('title');",
      "}",
      "",
    ].join("\n"));
}

async function writeFrontendI18nMessages(fixture, packageName) {
  await writeFixtureFile(fixture, "src/frontend/pages/i18n/en.ts", [
      `import { defineMessages } from ${JSON.stringify(packageName)};`,
      "",
      "export default defineMessages({ title: 'Title' });",
      "",
    ].join("\n"));
  await writeFixtureFile(fixture, "src/frontend/pages/i18n/cs.ts", [
      `import { defineMessages } from ${JSON.stringify(packageName)};`,
      "",
      "export default defineMessages({ title: 'Titulek' });",
      "",
    ].join("\n"));
}

async function writeI18nStub(fixture, packageName) {
  const packageDir = path.join(fixture, "node_modules", ...packageName.split("/"));
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(path.join(packageDir, "package.json"), JSON.stringify({
        exports: {
          ".": "./index.js",
        },
        name: packageName,
        type: "module",
      }, null, 2));
  await fs.writeFile(path.join(packageDir, "index.js"), [
      "export function defineMessages(messages) { return messages; }",
      "export function createLocalTranslator() { throw new Error('not transformed'); }",
      "export function createTranslator(bundle, language) {",
      "  return (key) => bundle[language]?.[key] || bundle.en?.[key] || key;",
      "}",
      "",
    ].join("\n"));
}

export {
  verifyDevelopmentRuntimeReusesInitialWatchBuild,
};
