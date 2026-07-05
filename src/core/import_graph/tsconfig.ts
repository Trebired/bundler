import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import type {
  BundlerImportGraphTsconfigOptions,
  BundlerTsconfigPaths,
} from "#jb343639kom2";
import { parseJsonLike } from "./parse.js";
import type { LoadedTsconfig, TsconfigPathMatcher } from "./shared.js";

const requireFromModule = createRequire(import.meta.url);

function resolveTsconfigExtends(tsconfigAbs: string, specifier: string): string {
  const normalized = String(specifier || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith(".") || normalized.startsWith("/")) {
    return resolveRelativeTsconfig(tsconfigAbs, normalized);
  }
  return resolvePackageTsconfig(tsconfigAbs, normalized);
}

function createTsconfigMatchers(paths: BundlerTsconfigPaths | undefined, targetRootAbs: string): TsconfigPathMatcher[] {
  return Object.entries(paths || {})
    .map(([key, values]) => ({
      key,
      prefix: key.includes("*") ? key.split("*")[0] || "" : key,
      suffix: key.includes("*") ? key.split("*").slice(1).join("*") : "",
      hasWildcard: key.includes("*"),
      targets: (values || []).map((value) => path.resolve(targetRootAbs, value)),
    }))
    .sort((a, b) => {
      if (a.hasWildcard !== b.hasWildcard) return a.hasWildcard ? 1 : -1;
      return b.key.length - a.key.length;
    });
}

function loadTsconfigFromFile(tsconfigAbs: string, seen = new Set<string>()): LoadedTsconfig {
  const normalizedAbs = path.resolve(tsconfigAbs);
  if (seen.has(normalizedAbs) || !fs.existsSync(normalizedAbs)) return { matchers: [] };
  seen.add(normalizedAbs);

  const parsed = parseJsonLike(fs.readFileSync(normalizedAbs, "utf8"));
  const compilerOptions = parsed && typeof parsed === "object" && parsed.compilerOptions && typeof parsed.compilerOptions === "object"
    ? parsed.compilerOptions as { baseUrl?: string; paths?: BundlerTsconfigPaths }
    : {};
  const parentAbs = parsed && typeof parsed === "object" && typeof parsed.extends === "string"
    ? resolveTsconfigExtends(normalizedAbs, parsed.extends)
    : "";
  const inherited = parentAbs ? loadTsconfigFromFile(parentAbs, seen) : { matchers: [], baseUrlAbs: undefined };
  const baseUrlAbs = typeof compilerOptions.baseUrl === "string" && compilerOptions.baseUrl.trim()
    ? path.resolve(path.dirname(normalizedAbs), compilerOptions.baseUrl)
    : inherited.baseUrlAbs;
  const targetRootAbs = baseUrlAbs || path.dirname(normalizedAbs);

  return {
    baseUrlAbs,
    matchers: [
      ...inherited.matchers.filter((matcher) => !(compilerOptions.paths && Object.prototype.hasOwnProperty.call(compilerOptions.paths, matcher.key))),
      ...createTsconfigMatchers(compilerOptions.paths, targetRootAbs),
    ],
  };
}

function loadTsconfig(rootDir: string, tsconfig: BundlerImportGraphTsconfigOptions | undefined): LoadedTsconfig {
  if (tsconfig === false) return { matchers: [] };
  if (typeof tsconfig === "string") return loadTsconfigFromFile(path.resolve(rootDir, tsconfig));
  if (tsconfig && typeof tsconfig === "object") return loadInlineTsconfig(rootDir, tsconfig);

  const defaultTsconfigAbs = path.resolve(rootDir, "tsconfig.json");
  return fs.existsSync(defaultTsconfigAbs) ? loadTsconfigFromFile(defaultTsconfigAbs) : { matchers: [] };
}

function applyTsconfigMatcher(specifier: string, matcher: TsconfigPathMatcher): string[] {
  if (!matcher.hasWildcard) return specifier === matcher.key ? matcher.targets.slice() : [];
  if (!specifier.startsWith(matcher.prefix) || !specifier.endsWith(matcher.suffix)) return [];
  const wildcardValue = specifier.slice(matcher.prefix.length, specifier.length - matcher.suffix.length);
  return matcher.targets.map((target) => target.replace(/\*/g, wildcardValue));
}

function loadInlineTsconfig(
  rootDir: string,
  tsconfig: Exclude<BundlerImportGraphTsconfigOptions, boolean | string | undefined>,
): LoadedTsconfig {
  const fileConfig = tsconfig.file
    ? loadTsconfigFromFile(path.resolve(rootDir, tsconfig.file))
    : { matchers: [], baseUrlAbs: undefined };
  const baseUrlAbs = typeof tsconfig.baseUrl === "string" && tsconfig.baseUrl.trim()
    ? path.resolve(rootDir, tsconfig.baseUrl)
    : fileConfig.baseUrlAbs;
  const targetRootAbs = baseUrlAbs || rootDir;

  return {
    baseUrlAbs,
    matchers: [
      ...fileConfig.matchers.filter((matcher) => !(tsconfig.paths && Object.prototype.hasOwnProperty.call(tsconfig.paths, matcher.key))),
      ...createTsconfigMatchers(tsconfig.paths, targetRootAbs),
    ],
  };
}

function resolveRelativeTsconfig(tsconfigAbs: string, specifier: string): string {
  const candidate = path.resolve(path.dirname(tsconfigAbs), specifier);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  if (fs.existsSync(`${candidate}.json`) && fs.statSync(`${candidate}.json`).isFile()) return `${candidate}.json`;
  return "";
}

function resolvePackageTsconfig(tsconfigAbs: string, specifier: string): string {
  try {
    return requireFromModule.resolve(specifier, { paths: [path.dirname(tsconfigAbs)] });
  } catch {
    try {
      return requireFromModule.resolve(`${specifier}.json`, { paths: [path.dirname(tsconfigAbs)] });
    } catch {
      return "";
    }
  }
}

export {
  applyTsconfigMatcher,
  loadTsconfig,
  loadTsconfigFromFile,
};
