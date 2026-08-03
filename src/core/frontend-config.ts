import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  BundlerEntryRecord,
  BundlerResolvedDiscovery,
  NormalizedBundlerLogger,
} from "#3c8d8166992a";
import type { ResolvedDiscovery } from "./discovery.js";

type FrontendConfigApi = {
  findTrebiredFrontendConfig?: (startDir?: string, boundaryDir?: string) => Promise<string | null>;
  loadTrebiredFrontendConfig?: (projectRoot?: string, options?: Record<string, unknown>) => Promise<{
    config: unknown;
    configPath: string | null;
    generatedScssPath: string;
  }>;
  writeGeneratedTrebiredFrontendScss?: (projectRoot: string, config: unknown) => Promise<string>;
};

type PreparedFrontendConfigStyles = {
  configPath: string | null;
  entryRecord: BundlerEntryRecord;
  generatedScssPath: string;
};

const FRONTEND_CONFIG_PATH = ".trebired/frontend/config.ts";
const FRONTEND_GENERATED_SCSS_PATH = ".trebired/frontend/generated/styles.scss";
const FRONTEND_CONFIG_RULE_KEY = "trebired-frontend-config";
const FRONTEND_CONFIG_ENTRY_KEY = "trebired-frontend-config:styles";
const FRONTEND_CONFIG_ENTRY_NAME = "trebired-frontend";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findFrontendConfigFile(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(current, FRONTEND_CONFIG_PATH);
    if (await pathExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolvePackageRoot(startDir: string, packageName: string): string | null {
  const segments = packageName.split("/");
  let current = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(current, "node_modules", ...segments);
    if (fsSync.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readJsonFileSync(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fsSync.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function resolvePackageExportTarget(packageRoot: string, packageJson: Record<string, unknown>, subpath: string): string | null {
  const exportsMap = packageJson.exports;
  if (!exportsMap || typeof exportsMap !== "object" || Array.isArray(exportsMap)) return null;
  const entry = (exportsMap as Record<string, unknown>)[subpath];
  const target = typeof entry === "string"
    ? entry
    : entry && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as Record<string, unknown>).import || (entry as Record<string, unknown>).default
      : null;
  if (typeof target !== "string") return null;
  return path.resolve(packageRoot, target);
}

function resolveFrontendConfigEntrypoint(rootDir: string): string | null {
  const packageRoot = resolvePackageRoot(rootDir, "@trebired/frontend");
  if (!packageRoot) return null;
  const packageJson = readJsonFileSync(path.join(packageRoot, "package.json"));
  if (!packageJson) return null;
  return resolvePackageExportTarget(packageRoot, packageJson, "./config");
}

async function loadFrontendConfigApi(rootDir: string): Promise<FrontendConfigApi | null> {
  const entrypoint = resolveFrontendConfigEntrypoint(rootDir);
  if (!entrypoint) return null;
  const url = pathToFileURL(entrypoint);
  url.searchParams.set("mtime", String(Date.now()));
  return await import(url.href) as FrontendConfigApi;
}

function createFrontendConfigEntryRecord(rootDir: string, generatedScssPath: string): BundlerEntryRecord {
  const source = normalizePath(path.relative(rootDir, generatedScssPath));
  return {
    entrySource: source,
    generated: true,
    key: FRONTEND_CONFIG_ENTRY_KEY,
    kind: "entry",
    name: FRONTEND_CONFIG_ENTRY_NAME,
    ownedSources: [source],
    path: generatedScssPath,
    ruleKey: FRONTEND_CONFIG_RULE_KEY,
    source: "discover",
    strategy: "entry",
  };
}

function normalizePath(value: string): string {
  return value.replace(/\\/gu, "/");
}

async function prepareFrontendConfigStyles(args: {
  environment?: string;
  logger: NormalizedBundlerLogger;
  rootDir: string;
}): Promise<PreparedFrontendConfigStyles | null> {
  if (args.environment === "node") return null;
  const configPath = await findFrontendConfigFile(args.rootDir);
  const api = await loadFrontendConfigApi(args.rootDir);
  if (!api) {
    if (configPath) throw new Error("bundler-frontend-config-package-missing :: @trebired/frontend");
    return null;
  }
  if (typeof api.loadTrebiredFrontendConfig !== "function" || typeof api.writeGeneratedTrebiredFrontendScss !== "function") {
    throw new Error("bundler-frontend-config-api-missing");
  }
  const loaded = await api.loadTrebiredFrontendConfig(args.rootDir, {
    defaultIfMissing: true,
    searchFrom: args.rootDir,
  });
  const generatedScssPath = await api.writeGeneratedTrebiredFrontendScss(args.rootDir, loaded.config);
  args.logger.info("frontend", `config-styles :: ${normalizePath(path.relative(args.rootDir, generatedScssPath))}`);
  return {
    configPath: loaded.configPath,
    entryRecord: createFrontendConfigEntryRecord(args.rootDir, generatedScssPath),
    generatedScssPath,
  };
}

async function refreshFrontendConfigScss(rootDir: string): Promise<{ configPath: string | null; generatedScssPath: string } | null> {
  const api = await loadFrontendConfigApi(rootDir);
  if (!api?.loadTrebiredFrontendConfig || !api.writeGeneratedTrebiredFrontendScss) return null;
  const loaded = await api.loadTrebiredFrontendConfig(rootDir, {
    defaultIfMissing: true,
    searchFrom: rootDir,
  });
  const generatedScssPath = await api.writeGeneratedTrebiredFrontendScss(rootDir, loaded.config);
  return { configPath: loaded.configPath, generatedScssPath };
}

function appendFrontendConfigStyleEntry(
  discovery: ResolvedDiscovery,
  prepared: PreparedFrontendConfigStyles | null,
): ResolvedDiscovery {
  if (!prepared) return discovery;
  const entry = prepared.entryRecord;
  const next: BundlerResolvedDiscovery = {
    entries: [...discovery.entries.filter((item) => item.key !== entry.key), entry]
      .sort((a, b) => a.key.localeCompare(b.key)),
    rules: {
      ...discovery.rules,
      [FRONTEND_CONFIG_RULE_KEY]: {
        entryKeys: [entry.key],
        ignoredSources: [],
        ruleKey: FRONTEND_CONFIG_RULE_KEY,
        strategy: "entry",
      },
    },
    sourceOwners: {
      ...discovery.sourceOwners,
      [entry.ownedSources[0]]: entry.key,
    },
  };
  return {
    ...next,
    signature: JSON.stringify({
      base: discovery.signature,
      frontendConfigEntry: entry.ownedSources[0],
    }),
  };
}

function createEmptyResolvedDiscovery(): ResolvedDiscovery {
  return {
    entries: [],
    rules: {},
    signature: JSON.stringify({
      entries: [],
      rules: {},
      sourceOwners: {},
    }),
    sourceOwners: {},
  };
}

function defaultFrontendGeneratedScssPath(rootDir: string): string {
  return path.resolve(rootDir, FRONTEND_GENERATED_SCSS_PATH);
}

export {
  FRONTEND_CONFIG_PATH,
  FRONTEND_GENERATED_SCSS_PATH,
  appendFrontendConfigStyleEntry,
  createEmptyResolvedDiscovery,
  defaultFrontendGeneratedScssPath,
  findFrontendConfigFile,
  prepareFrontendConfigStyles,
  refreshFrontendConfigScss,
};
export type { PreparedFrontendConfigStyles };
