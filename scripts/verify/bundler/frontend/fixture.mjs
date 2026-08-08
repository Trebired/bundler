import fs from "node:fs/promises";
import path from "node:path";

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
    "",
    "const configRel = '.trebired/frontend/config.ts';",
    "const tokensRel = '.trebired/frontend/tokens.ts';",
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
  ];
}

function fixtureModuleLoader() {
  return [
    "export async function loadTrebiredFrontendConfig(rootDir = process.cwd()) {",
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
    "    generatedScss: generateTrebiredFrontendScss(config),",
    "  };",
    "}",
    "",
  ];
}

function fixtureModuleGenerator() {
  return [
    "export function generateTrebiredFrontendScss(config) {",
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
    "  return lines.join('\\n');",
    "}",
  ];
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

async function writeFile(root, rel, contents) {
  const filePath = path.join(root, rel);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

function organizationName() {
  return String.fromCharCode(116, 114, 101, 98, 105, 114, 101, 100);
}

export { writeFrontendConfig, writeFrontendPackageFixture };
