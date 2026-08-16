import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_WORKSPACE_CONFIG_DIR } from "#m7884285ke1w";
import { normalizeBundlerPrefix } from "#u2yl3eyjja3a";

const SCSS_NAMESPACE_SCHEME = "package-scss-namespace:";
const BUNDLER_NAMESPACE_SPECIFIER = "@trebired/bundler/namespace";

type ScssNamespaceContext = {
  namespacePrefixes: Map<string, string>;
  rootDir: string;
};

function toNamespaceUrl(ownerRoot: string): URL {
  return new URL(`${SCSS_NAMESPACE_SCHEME}${encodeURIComponent(ownerRoot)}`);
}

function fromNamespaceUrl(url: URL): string {
  if (url.protocol !== SCSS_NAMESPACE_SCHEME) return "";
  return decodeURIComponent(url.href.slice(SCSS_NAMESPACE_SCHEME.length));
}

function findNearestPackageRoot(startDir: string, fallbackRoot: string): string {
  let current = path.resolve(startDir);
  const fallback = path.resolve(fallbackRoot);
  for (;; ) {
    if (fs.existsSync(path.join(current, "package.json"))) return current;
    if (current === fallback) return fallback;
    const parent = path.dirname(current);
    if (parent === current) return fallback;
    current = parent;
  }
}

function resolveNamespaceOwnerRoot(rootDir: string, containingUrl?: URL | null): string {
  if (!containingUrl || containingUrl.protocol !== "file:") return rootDir;
  const filePath = fileURLToPath(containingUrl);
  return findNearestPackageRoot(path.dirname(filePath), rootDir);
}

function readNamespacePrefix(context: ScssNamespaceContext, ownerRoot: string): string {
  const cached = context.namespacePrefixes.get(ownerRoot);
  if (cached !== undefined) return cached;
  const configPath = path.join(ownerRoot, PACKAGE_WORKSPACE_CONFIG_DIR, "bundler", "config.ts");
  const prefix = fs.existsSync(configPath) ? parseNamespacePrefix(fs.readFileSync(configPath, "utf8"), configPath) : "";
  context.namespacePrefixes.set(ownerRoot, prefix);
  return prefix;
}

function parseNamespacePrefix(source: string, configPath: string): string {
  if (/\bprefix\s*:\s*false\b/u.test(source)) return "";
  const match = /\bprefix\s*:\s*(["'])(.*?)\1/su.exec(source);
  return match ? normalizeBundlerPrefix(match[2], `prefix in ${configPath}`) : "";
}

function renderSassNamespace(prefix: string): string {
  return [
    '@use "sass:string";',
    "",
    `$bundler-prefix: ${sassString(prefix)};`,
    "",
    ...sassNamespaceNameSource(),
    ...sassNamespacePublicSource(),
    "",
  ].join("\n");
}

function sassNamespaceNameSource(): string[] {
  return [
    "@function _namespace-name($name) {",
    "  $normalized: \"#{$name}\";",
    "  @if $normalized == \"\" { @error \"namespace name must be non-empty\"; }",
    "  @return $normalized;",
    "}",
    "",
    "@function _prefixed-name($name) {",
    "  $normalized: _namespace-name($name);",
    "  @if $bundler-prefix == \"\" { @return $normalized; }",
    "  @return \"#{$bundler-prefix}-#{$normalized}\";",
    "}",
    "",
  ];
}

function sassNamespacePublicSource(): string[] {
  return [
    "@function class($name) { @return string.unquote(\".#{_prefixed-name($name)}\"); }",
    "@function element-class($block, $element) { @return string.unquote(\".#{_prefixed-name($block)}__#{_namespace-name($element)}\"); }",
    "@function modifier($block, $modifier) { @return string.unquote(\".#{_prefixed-name($block)}--#{_namespace-name($modifier)}\"); }",
    "@function data-attr($name) { @return string.unquote(\"data-#{_prefixed-name($name)}\"); }",
    "@function data($name, $value: null) {",
    "  @if $value == null { @return string.unquote(\"[#{data-attr($name)}]\"); }",
    "  @return string.unquote(\"[#{data-attr($name)}=\\\"#{$value}\\\"]\");",
    "}",
    "@function css-var($name) { @return string.unquote(\"--#{_prefixed-name($name)}\"); }",
    "@function css-var-ref($name, $fallback: null) {",
    "  @if $fallback == null { @return string.unquote(\"var(#{css-var($name)})\"); }",
    "  @return string.unquote(\"var(#{css-var($name)}, #{$fallback})\");",
    "}",
    "@function token($name) { @return string.unquote(\"#{_prefixed-name($name)}\"); }",
  ];
}

function sassString(value: string): string {
  return `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"")}"`;
}

function loadSassNamespace(context: ScssNamespaceContext, canonicalUrl: URL): { contents: string; syntax: "scss" } | null {
  const namespaceRoot = fromNamespaceUrl(canonicalUrl);
  if (!namespaceRoot) return null;
  return {
    contents: renderSassNamespace(readNamespacePrefix(context, namespaceRoot)),
    syntax: "scss",
  };
}

export {
  BUNDLER_NAMESPACE_SPECIFIER,
  loadSassNamespace,
  resolveNamespaceOwnerRoot,
  toNamespaceUrl,
};
export type { ScssNamespaceContext };
