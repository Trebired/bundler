import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bundle } from "../../dist/index.js";
import {
  createCaptureLogger,
  importJavaScriptOutput,
  organizationName,
  resetTemporaryRoot,
} from "./shared.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = path.join(rootDir, ".tmp", "verify-i18n");
const packageName = `@${organizationName()}/i18n`;

async function verifyI18nPlugin() {
  await resetTemporaryRoot(tempRoot);
  await verifyBrowserBuild();
  await verifyNodeBuild();
  await verifyLocalTranslatorLogging();
  await verifyBuildFailures();
  await verifyExistingBuildPath();
  console.log("Bundler i18n verification succeeded.");
}

async function verifyBrowserBuild() {
  const fixture = await createRuntimeFixture("browser", "component.client.ts");
  const result = await runBundle(fixture, {
      environment: "browser",
      include: ["**/*.client.ts"],
      outDir: "dist-browser",
  });
  const output = await importJavaScriptOutput(result.outputs);
  assert.equal(output.render("cs"), "Titulek Ada|Vnoreno|Plocha");
  await assertBundleIncludes(result.outputs, ["Titulek", "Nested", "Flat"]);
}

async function verifyNodeBuild() {
  const fixture = await createRuntimeFixture("node", "component.server.ts");
  const result = await runBundle(fixture, {
      environment: "node",
      include: ["**/*.server.ts"],
      outDir: "dist-node",
  });
  const output = await importJavaScriptOutput(result.outputs);
  assert.equal(output.render("de"), "Title Ada|Nested|Flat");
}

async function verifyLocalTranslatorLogging() {
  const fixture = path.join(tempRoot, "logging");
  await writeI18nStub(fixture);
  for (let index = 0; index < 12; index += 1) {
    const featureDir = path.join(fixture, "src", `feature-${index}`);
    const i18nDir = path.join(featureDir, "i18n");
    await fs.mkdir(i18nDir, { recursive: true });
    await writeFeatureEntry(path.join(featureDir, "component.client.ts"));
    await writeLanguageFile(i18nDir, "en", {
        "flat.key": "Flat",
        nested: { value: "Nested" },
        title: "Title {name}",
    });
    await writeLanguageFile(i18nDir, "cs", {
        "flat.key": "Plocha",
        nested: { value: "Vnoreno" },
        title: "Titulek {name}",
    });
  }

  const capture = createCaptureLogger();
  await runBundle(fixture, {
      environment: "browser",
      include: ["**/*.client.ts"],
      logger: capture.logger,
      outDir: "dist-logging",
  });

  assert.equal(capture.events.some((event) => event.message.includes("local-translator ::")), false);
  assert.equal(capture.events.some((event) => event.message === "local translators transformed"), false);
  assert.equal(capture.events.some((event) => event.message === "local translators complete"), false);

  const summaries = capture.events.filter((event) => event.message === "local translators summary");
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].metadata?.transformed_files, 12);
  assert.equal(summaries[0].metadata?.transformed_folders, 12);
  assert.equal(summaries[0].metadata?.language_files, 24);
  assert.deepEqual(summaries[0].metadata?.languages, ["cs", "en"]);
  assert.equal(typeof summaries[0].metadata?.took_ms, "number");
}

async function verifyBuildFailures() {
  await assertBundleFails("missing", async(fixture) => {
      await createRuntimeFixture(fixture, "component.client.ts", { languages: ["en"] });
    }, "missing-language-file");

  await assertBundleFails("unsupported", async(fixture) => {
      await createRuntimeFixture(fixture, "component.client.ts", { languages: ["en", "cs", "fr"] });
    }, "unsupported-language-file");

  await assertBundleFails("invalid", async(fixture) => {
      await createRuntimeFixture(fixture, "component.client.ts", { invalidCs: true });
    }, "invalid-default-export");
}

async function verifyExistingBuildPath() {
  const fixture = path.join(tempRoot, "existing");
  await fs.mkdir(path.join(fixture, "src"), { recursive: true });
  await fs.writeFile(path.join(fixture, "src", "main.ts"), [
      "export const value = 42;",
      "",
    ].join("\n"));

  const result = await bundle({
      discover: {
        dir: "src",
        rules: [
          { key: "entry", include: ["**/*.ts"], strategy: "entry" },
        ],
      },
      format: "esm",
      outDir: "dist-existing",
      rootDir: fixture,
  });
  const output = await importJavaScriptOutput(result.outputs);
  assert.equal(output.value, 42);
}

async function runBundle(fixture, args) {
  return bundle({
      discover: {
        dir: "src",
        rules: [
          { key: "entry", include: args.include, strategy: "entry" },
          { key: "shared", include: ["**/*.ts"], exclude: args.include, strategy: "bundle" },
        ],
      },
      environment: args.environment,
      format: "esm",
      i18n: {
        supportedLanguages: ["en", "cs"],
      },
      logger: args.logger,
      outDir: args.outDir,
      rootDir: fixture,
  });
}

async function assertBundleFails(name, writeFixture, expectedMessage) {
  const fixture = path.join(tempRoot, name);
  await writeFixture(fixture);
  await assert.rejects(
    () => runBundle(fixture, {
        environment: "browser",
        include: ["**/*.client.ts"],
        outDir: "dist",
    }),
    (error) => String(error?.message || error).includes(expectedMessage),
  );
}

async function createRuntimeFixture(nameOrFixture, entryFile, options = {}) {
  const fixture = path.isAbsolute(nameOrFixture) ? nameOrFixture : path.join(tempRoot, nameOrFixture);
  const featureDir = path.join(fixture, "src", "feature");
  const i18nDir = path.join(featureDir, "i18n");
  await fs.mkdir(i18nDir, { recursive: true });
  await writeI18nStub(fixture);
  await writeFeatureEntry(path.join(featureDir, entryFile));

  const languages = options.languages || ["en", "cs"];
  if (languages.includes("en")) await writeLanguageFile(i18nDir, "en", {
      "flat.key": "Flat",
      nested: { value: "Nested" },
      title: "Title {name}",
  });
  if (languages.includes("cs")) {
    await writeLanguageFile(i18nDir, "cs", {
        "flat.key": "Plocha",
        nested: { value: "Vnoreno" },
        title: "Titulek {name}",
      }, options.invalidCs);
  }
  if (languages.includes("fr")) await writeLanguageFile(i18nDir, "fr", { title: "Titre {name}" });
  return fixture;
}

async function writeI18nStub(fixture) {
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
      "  return (key, variables = {}) => interpolate(lookup(bundle[language], key) || lookup(bundle.en, key) || key, variables);",
      "}",
      "function lookup(messages, key) {",
      "  if (!messages) return '';",
      "  if (typeof messages[key] === 'string') return messages[key];",
      "  let current = messages;",
      "  for (const part of key.split('.')) current = current && current[part];",
      "  return typeof current === 'string' ? current : '';",
      "}",
      "function interpolate(template, variables) {",
      "  return template.replace(/\\{\\{\\s*([A-Za-z0-9_.-]+)\\s*\\}\\}|\\{([A-Za-z0-9_.-]+)\\}/g, (_m, a, b) => String(variables[a || b] ?? _m));",
      "}",
    ].join("\n"));
}

async function writeFeatureEntry(filePath) {
  await fs.writeFile(filePath, [
      `import { createLocalTranslator } from ${JSON.stringify(packageName)};`,
      "",
      "export function render(lang) {",
      "  const t = createLocalTranslator(import.meta.url, lang);",
      "  return `${t('title', { name: 'Ada' })}|${t('nested.value')}|${t('flat.key')}`;",
      "}",
      "",
    ].join("\n"));
}

async function writeLanguageFile(folder, language, messages, invalid = false) {
  const filePath = path.join(folder, `${language}.ts`);
  const contents = invalid
  ? "export default { title: 'Titulek {name}' };\n"
  : [
    `import { defineMessages } from ${JSON.stringify(packageName)};`,
    "",
    `export default defineMessages(${formatMessages(messages)});`,
    "",
  ].join("\n");
  await fs.writeFile(filePath, contents);
}

function formatMessages(messages) {
  const serialized = JSON.stringify(messages, null, 2);
  if (typeof messages.title !== "string") return serialized;

  const splitAt = messages.title.indexOf("{");
  if (splitAt <= 0) return serialized;

  return serialized.replace(
    `"title": ${JSON.stringify(messages.title)}`,
    [
      "\"title\":",
      `    ${JSON.stringify(messages.title.slice(0, splitAt))} +`,
      `    ${JSON.stringify(messages.title.slice(splitAt))}`,
    ].join("\n"),
  );
}

async function assertBundleIncludes(outputs, values) {
  const outputPath = outputs.find((item) => item.endsWith(".js"));
  assert.ok(outputPath, "expected JavaScript output");
  const source = await fs.readFile(outputPath, "utf8");
  for (const value of values) assert.equal(source.includes(value), true);
}

await verifyI18nPlugin();
