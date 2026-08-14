import fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  BundlerEntryRecord,
  BundlerResolvedDiscovery,
  NormalizedBundlerLogger,
} from "#3c8d8166992a";
import { VIRTUAL_ENTRY_PREFIX, toPosixPath } from "#5kd9snhn6zft";
import { PACKAGE_ORGANIZATION_NAME, PACKAGE_WORKSPACE_CONFIG_DIR } from "#m7884285ke1w";
import type { ResolvedDiscovery } from "./discovery.js";
import { pathExists } from "./shared.js";

type LoadedFrontendConfig = {
  config: unknown;
  configPath: string | null;
  dependencies?: readonly string[];
  generatedScss?: string;
};

type FrontendConfigApi = {
  findConfig?: (startDir?: string, boundaryDir?: string) => Promise<string|null>;
  loadConfig?: (projectRoot?: string, options?: Record<string, unknown>) => Promise<LoadedFrontendConfig>;
  generateFrontendScss?: (config: unknown) => string;
};

type ResolvedFrontendConfigStyles = {
  configPath: string | null;
  dependencies: string[];
  scss: string;
};

type PreparedFrontendConfigStyles = {
  configPath: string | null;
  dependencies: string[];
  entryRecord: BundlerEntryRecord;
};

const FRONTEND_CONFIG_PATH = `${PACKAGE_WORKSPACE_CONFIG_DIR}/frontend/config.ts`;
const FRONTEND_CONFIG_RULE_KEY = "frontend-config";
const FRONTEND_CONFIG_ENTRY_KEY = "frontend-config:styles";
const FRONTEND_CONFIG_ENTRY_NAME = "frontend";
const FRONTEND_CONFIG_VIRTUAL_ENTRY_NAME = "frontend-config-styles";
const FRONTEND_CONFIG_VIRTUAL_ENTRY_PATH = `${VIRTUAL_ENTRY_PREFIX}${FRONTEND_CONFIG_VIRTUAL_ENTRY_NAME}`;

async function findFrontendConfigFile(startDir: string): Promise<string|null> {
  let current = path.resolve(startDir);
  for (;; ) {
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
  for (;; ) {
    const candidate = path.join(current, "node_modules", ...segments);
    if (fsSync.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readJsonFileSync(filePath: string): Record<string, unknown>|null {
  try {
    const parsed = JSON.parse(fsSync.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function resolveFrontendPackageExportTarget(packageRoot: string, packageJson: Record<string, unknown>, subpath: string): string | null {
  const exportsMap = packageJson.exports;
  if (!exportsMap || typeof exportsMap !== "object" || Array.isArray(exportsMap)) return null;
  const entry = (exportsMap as Record<string, unknown>)[subpath];
  const target = typeof entry === "string"
  ? entry
  : entry && typeof entry === "object" && !Array.isArray(entry)
  ? (entry as Record<string, unknown>).import ||(entry as Record<string, unknown>).default
  : null;
  if (typeof target !== "string") return null;
  return path.resolve(packageRoot, target);
}

function resolveFrontendConfigEntrypoint(rootDir: string): string | null {
  const packageName = `@${PACKAGE_ORGANIZATION_NAME}/frontend`;
  const packageRoot = resolvePackageRoot(rootDir, packageName);
  if (!packageRoot) return null;
  const packageJson = readJsonFileSync(path.join(packageRoot, "package.json"));
  if (!packageJson) return null;
  return resolveFrontendPackageExportTarget(packageRoot, packageJson, "./config");
}

async function loadFrontendConfigApi(rootDir: string): Promise<FrontendConfigApi|null> {
  const entrypoint = resolveFrontendConfigEntrypoint(rootDir);
  if (!entrypoint) return null;
  const url = pathToFileURL(entrypoint);
  url.searchParams.set("mtime", String(Date.now()));
  return await import(url.href) as FrontendConfigApi;
}

function createFrontendConfigEntryRecord(configPath: string | null, rootDir: string): BundlerEntryRecord {
  const source = configPath ? toPosixPath(path.relative(rootDir, configPath)) : FRONTEND_CONFIG_PATH;
  return {
    entrySource: source,
    contents: "",
    generated: true,
    key: FRONTEND_CONFIG_ENTRY_KEY,
    kind: "entry",
    name: FRONTEND_CONFIG_ENTRY_NAME,
    ownedSources: [source],
    path: FRONTEND_CONFIG_VIRTUAL_ENTRY_PATH,
    ruleKey: FRONTEND_CONFIG_RULE_KEY,
    source: "internal",
    strategy: "entry",
    virtualLoader: "css",
  };
}

function normalizeConfigDependencies(value: unknown, configPath: string | null): string[] {
  const dependencies = new Set<string>();
  if (configPath) dependencies.add(path.resolve(configPath));
  for (const item of Array.isArray(value) ? value : []) {
    if (typeof item === "string" && item.trim()) dependencies.add(path.resolve(item));
  }
  return [...dependencies];
}

async function resolveFrontendConfigStyles(
  rootDir: string,
  preloadedApi?: FrontendConfigApi | null,
): Promise<ResolvedFrontendConfigStyles> {
  const api = preloadedApi || await loadFrontendConfigApi(rootDir);
  if (typeof api?.loadConfig !== "function") {
    throw new Error("bundler-frontend-config-api-missing");
  }
  const loaded = await api.loadConfig(rootDir, {
      defaultIfMissing: true,
      searchFrom: rootDir,
  });
  const scss = typeof loaded.generatedScss === "string"
  ? loaded.generatedScss
  : typeof api.generateFrontendScss === "function"
  ? api.generateFrontendScss(loaded.config)
  : "";
  if (!scss) throw new Error("bundler-frontend-config-scss-missing");
  return {
    configPath: loaded.configPath,
    dependencies: normalizeConfigDependencies(loaded.dependencies, loaded.configPath),
    scss,
  };
}

async function prepareFrontendConfigStyles(args: {
    environment?: string;
    logger: NormalizedBundlerLogger;
    rootDir: string;
}): Promise<PreparedFrontendConfigStyles|null> {
  if (args.environment === "node") return null;
  const configPath = await findFrontendConfigFile(args.rootDir);
  const api = await loadFrontendConfigApi(args.rootDir);
  if (!api) {
    if (configPath) throw new Error(`bundler-frontend-config-package-missing :: @${PACKAGE_ORGANIZATION_NAME}/frontend`);
    return null;
  }
  const resolved = await resolveFrontendConfigStyles(args.rootDir, api);
  args.logger.info("frontend", `config-styles :: virtual watch=${resolved.dependencies.length}`);
  return {
    configPath: resolved.configPath,
    dependencies: resolved.dependencies,
    entryRecord: createFrontendConfigEntryRecord(resolved.configPath, args.rootDir),
  };
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

export {
  FRONTEND_CONFIG_PATH,
  FRONTEND_CONFIG_RULE_KEY,
  FRONTEND_CONFIG_VIRTUAL_ENTRY_NAME,
  FRONTEND_CONFIG_VIRTUAL_ENTRY_PATH,
  appendFrontendConfigStyleEntry,
  createEmptyResolvedDiscovery,
  findFrontendConfigFile,
  loadFrontendConfigApi,
  prepareFrontendConfigStyles,
  resolveFrontendConfigStyles,
};
export type { LoadedFrontendConfig, PreparedFrontendConfigStyles, ResolvedFrontendConfigStyles };
