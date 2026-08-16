import fs from "node:fs/promises";
import path from "node:path";
import type {
  BundlerProjectConfig,
  NormalizedBundlerProjectConfig,
} from "#6wgcj9fvnm87";
import { loadConfig } from "./index.js";
import { normalizeBundlerPrefix } from "./namespace.js";

type GenerateNamespaceModuleOptions = {
  prefixExportName?: string;
};

type WriteNamespaceModuleOptions = {
  configPath?: string;
  outFile: string;
  rootDir?: string;
};

function generateNamespaceModule(
  config: BundlerProjectConfig | NormalizedBundlerProjectConfig = {},
  options: GenerateNamespaceModuleOptions = {},
): string {
  const prefix = normalizeBundlerPrefix(config.prefix);
  const prefixExportName = normalizeExportName(options.prefixExportName || "NAMESPACE_PREFIX");
  const prefixLines = prefixExportName === "NAMESPACE_PREFIX"
  ? [`const NAMESPACE_PREFIX = ${JSON.stringify(prefix)};`]
  : [
    `const ${prefixExportName} = ${JSON.stringify(prefix)};`,
    `const NAMESPACE_PREFIX = ${prefixExportName};`,
  ];
  return [
    "type NamespaceValue = string | number | boolean;",
    "type DataAttrsInput = Record<string, NamespaceValue | null | undefined>;",
    "type DataAttrsOutput = Record<string, NamespaceValue | null | undefined>;",
    "",
    ...prefixLines,
    "",
    namespaceRuntimeSource(),
    "",
  ].join("\n");
}

async function writeNamespaceModule(options: WriteNamespaceModuleOptions): Promise<string> {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const outFile = path.resolve(rootDir, options.outFile);
  const loaded = await loadConfig(rootDir, options.configPath ? { configPath: options.configPath } : {});
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, generateNamespaceModule(loaded.config), "utf8");
  return outFile;
}

function normalizeExportName(value: string): string {
  const name = value.trim();
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name)) throw new Error("prefix export name must be a valid identifier");
  return name;
}

function namespaceRuntimeSource(): string {
  return [
    ...namespaceRuntimePrivateSource(),
    ...namespaceRuntimePublicSource(),
    "",
    "export {",
    "  NAMESPACE_PREFIX,",
    "  className,",
    "  cssVar,",
    "  cssVarRef,",
    "  dataAttr,",
    "  dataAttrs,",
    "  dataSelector,",
    "  elementClass,",
    "  eventName,",
    "  modifierClass,",
    "  token,",
    "};",
  ].join("\n");
}

function namespaceRuntimePrivateSource(): string[] {
  return [
    "function namespaceName(name: string): string {",
    "  const normalizedName = String(name || \"\").trim();",
    "  if (!normalizedName) throw new Error(\"namespace name must be a non-empty string\");",
    "  return normalizedName;",
    "}",
    "",
    "function prefixedName(name: string): string {",
    "  const normalizedName = namespaceName(name);",
    "  return NAMESPACE_PREFIX ? `${NAMESPACE_PREFIX}-${normalizedName}` : normalizedName;",
    "}",
    "",
    "function selectorValue(value: NamespaceValue): string {",
    "  return String(value).replace(/\\\\/gu, \"\\\\\\\\\").replace(/\"/gu, \"\\\\\\\"\");",
    "}",
    "",
  ];
}

function namespaceRuntimePublicSource(): string[] {
  return [
    "function className(name: string): string { return prefixedName(name); }",
    "function elementClass(block: string, element: string): string { return `${prefixedName(block)}__${namespaceName(element)}`; }",
    "function modifierClass(block: string, modifier: string): string { return `${prefixedName(block)}--${namespaceName(modifier)}`; }",
    "function dataAttr(name: string): string { return `data-${prefixedName(name)}`; }",
    "function dataAttrs(input: DataAttrsInput): DataAttrsOutput {",
    "  return Object.fromEntries(Object.entries(input).map(([name, value]) => [dataAttr(name), value]));",
    "}",
    "function dataSelector(name: string, value?: NamespaceValue): string {",
    "  const attr = dataAttr(name);",
    "  return value === undefined ? `[${attr}]` : `[${attr}=\\\"${selectorValue(value)}\\\"]`;",
    "}",
    "function cssVar(name: string): string { return `--${prefixedName(name)}`; }",
    "function cssVarRef(name: string, fallback?: string): string {",
    "  const variable = `var(${cssVar(name)}`;",
    "  return fallback === undefined ? `${variable})` : `${variable}, ${fallback})`;",
    "}",
    "function token(name: string): string { return prefixedName(name); }",
    "function eventName(name: string): string {",
    "  const normalizedName = namespaceName(name);",
    "  return NAMESPACE_PREFIX ? `${NAMESPACE_PREFIX}:${normalizedName}` : normalizedName;",
    "}",
  ];
}

export {
  generateNamespaceModule,
  writeNamespaceModule,
};
export type {
  GenerateNamespaceModuleOptions,
  WriteNamespaceModuleOptions,
};
