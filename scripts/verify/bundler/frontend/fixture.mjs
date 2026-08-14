import fs from "node:fs/promises";
import path from "node:path";

import { organizationName, writeFixtureFile } from "#0ss24zzupv8u";

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
        },
        name: packageName,
        type: "module",
        version: "0.0.0-fixture",
      }, null, 2));
  await writeFixtureFile(packageRoot, "dist/styles/tokens.scss", ":root { --tbf-radius: 0; }\n");
  await writeFixtureFile(packageRoot, "dist/styles/utils.scss", ".inline-row { display: inline-flex; }\n");
  await writeFixtureFile(packageRoot, "dist/fonts/inter.woff2", "fixture-font\n");
  await writeFixtureFile(packageRoot, "dist/icons/styles/index.scss", ".tbf-icon { color: currentColor; }\n");
  await writeFixtureFile(packageRoot, "dist/flash/styles/index.scss", ".tbf-flash { color: black; }\n");
  await writeFixtureFile(packageRoot, "dist/modal/styles/index.scss", ".tbf-modal { display: block; }\n");
  await writeFixtureFile(packageRoot, "config/index.js", frontendConfigFixtureModule());
}

function frontendConfigFixtureModule() {
  return [
    ...fixtureModulePreamble(),
    ...fixtureModuleLoader(),
    ...fixtureModuleGenerator(),
    "",
  ].join("\n");
}

function fixtureModulePreamble() {
  return [
    "import fs from 'node:fs/promises';",
    "import path from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "",
    "const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
    "const configBase = `.${'tre'}bired/frontend`;",
    "const configRel = `${configBase}/config.ts`;",
    "const tokensRel = `${configBase}/tokens.ts`;",
    "",
    "function stylePath(rel) {",
    "  return path.join(packageRoot, rel).replace(/\\\\/g, '/');",
    "}",
    "",
    "function styleLoad(rel) {",
    "  return `@include meta.load-css(\"${stylePath(rel)}\");`;",
    "}",
    "",
    "export function defineConfig(config) {",
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
  ];
}

function fixtureModuleLoader() {
  return [
    "export async function loadConfig(rootDir = process.cwd()) {",
    "  const configPath = path.join(rootDir, configRel);",
    "  const tokensPath = path.join(rootDir, tokensRel);",
    "  const found = await exists(configPath);",
    "  const hasTokens = found && await exists(tokensPath);",
    "  const config = found ? parseConfigText(await fs.readFile(configPath, 'utf8')) : {",
    "    prefix: 'tbf',",
    "    systems: { flash: true, icons: true, modal: true },",
    "    token: null,",
    "  };",
    "  if (hasTokens) {",
    "    const brand = /brand\\s*=\\s*[\"']([^\"']+)/u.exec(await fs.readFile(tokensPath, 'utf8'));",
    "    if (brand) config.token = brand[1];",
    "  }",
    "  return {",
    "    config,",
    "    configPath: found ? configPath : null,",
    "    dependencies: found ? [configPath, ...(hasTokens ? [tokensPath] : [])] : [],",
    "    generatedScss: generateFrontendScss(config),",
    "  };",
    "}",
    "",
  ];
}

function fixtureModuleGenerator() {
  return [
    "export function generateFrontendScss(config) {",
    "  const lines = [",
    "    '@use \"sass:meta\";',",
    `    \`@font-face { font-family: Fixture; font-display: swap; src: url("\${stylePath('dist/fonts/inter.woff2')}") format("woff2"); }\`,`,
    "    styleLoad('dist/styles/tokens.scss'),",
    "    styleLoad('dist/styles/utils.scss'),",
    "  ];",
    "  if (config.systems.icons) lines.push(styleLoad('dist/icons/styles/index.scss'));",
    "  if (config.systems.flash) lines.push(styleLoad('dist/flash/styles/index.scss'));",
    "  if (config.systems.modal) lines.push(styleLoad('dist/modal/styles/index.scss'));",
    "  lines.push('', ':root {', `  --${config.prefix}-icon-endpoint: \"/__icons/svg\";`);",
    "  if (config.token) lines.push(`  --${config.prefix}-color-brand: ${config.token};`);",
    "  lines.push('}', '');",
    "  return lines.join('\\n');",
    "}",
  ];
}

async function writeFrontendConfig(configPath, options) {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, [
      `import { defineConfig } from "@${organizationName()}/frontend/config";`,
      "",
      "export default defineConfig({",
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

export { writeFrontendConfig, writeFrontendPackageFixture };
