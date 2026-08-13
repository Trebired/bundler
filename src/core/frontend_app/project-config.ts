import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  BundlerFrontendAppBundlerConfigOptions,
  BundlerI18nOptions,
  BundlerProjectConfig,
} from "#3c8d8166992a";
import { applyProjectConfigToFrontendBundlerOptions } from "./config.js";
import { loadBundlerProjectConfig } from "#z1hxysbp7ydt";

type ExternalI18nConfig = {
  defaultLanguage?: string;
  fallbackLanguage?: string;
  local?: {
    dirName?: string;
    extensions?: string | string[];
  };
  supportedLanguages?: readonly string[];
};

type NormalizedExternalI18nConfig = ExternalI18nConfig& {
  local?: {
    dirName?: string;
    extensions?: string[];
  };
};

const PACKAGE_SCOPE = [116, 114, 101, 98, 105, 114, 101, 100]
.map((code) => String.fromCharCode(code))
.join("");
const I18N_CONFIG_MODULE = `@${PACKAGE_SCOPE}/i18n/config`;
const I18N_PROJECT_CONFIG_PATH = ".trebired/i18n/config.ts";

async function applyProjectConfigsToFrontendBundlerOptions(
  options: BundlerFrontendAppBundlerConfigOptions,
): Promise<BundlerFrontendAppBundlerConfigOptions> {
  const projectConfig = await loadFrontendProjectConfig(options.rootDir);
  return applyProjectConfigToFrontendBundlerOptions(options, projectConfig);
}

async function loadFrontendProjectConfig(rootDir = process.cwd()): Promise<BundlerProjectConfig> {
  const loadedBundler = await loadBundlerProjectConfig(rootDir);
  const i18n = loadedBundler.config.i18n === undefined
  ? await loadI18nBundlerOptions(rootDir)
  : loadedBundler.config.i18n;

  return {
    build: loadedBundler.config.build,
    frontend: loadedBundler.config.frontend,
    i18n,
    prefix: loadedBundler.config.prefix,
    staticAssets: loadedBundler.config.staticAssets,
  };
}

async function loadI18nBundlerOptions(rootDir: string): Promise<BundlerI18nOptions|undefined> {
  const configPath = path.join(path.resolve(rootDir), I18N_PROJECT_CONFIG_PATH);
  if (!await pathExists(configPath)) return undefined;

  const packageConfig = await loadI18nViaPackage(rootDir);
  if (packageConfig) return i18nOptionsFromNormalizedConfig(packageConfig);

  const imported = await import(pathToFileURL(configPath).href);
  return i18nOptionsFromConfig(readDefaultI18nConfig(imported, configPath));
}

async function loadI18nViaPackage(rootDir: string): Promise<NormalizedExternalI18nConfig|null> {
  try {
    const api = await import(I18N_CONFIG_MODULE);
    if (typeof api.loadConfig !== "function") return null;
    const loaded = await api.loadConfig(rootDir);
    return loaded?.config && typeof loaded.config === "object" ? loaded.config as NormalizedExternalI18nConfig : null;
  }
  catch {
    return null;
  }
}

function i18nOptionsFromNormalizedConfig(config: NormalizedExternalI18nConfig): BundlerI18nOptions {
  return {
    defaultLanguage: normalizeString(config.defaultLanguage || config.fallbackLanguage),
    dirName: normalizeString(config.local?.dirName),
    enabled: true,
    extensions: normalizeStringList(config.local?.extensions),
    supportedLanguages: normalizeStringList(config.supportedLanguages),
  };
}

function i18nOptionsFromConfig(config: ExternalI18nConfig): BundlerI18nOptions {
  return {
    defaultLanguage: normalizeString(config.defaultLanguage || config.fallbackLanguage),
    dirName: normalizeString(config.local?.dirName),
    enabled: true,
    extensions: normalizeStringList(config.local?.extensions),
    supportedLanguages: normalizeStringList(config.supportedLanguages),
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  }
  catch {
    return false;
  }
}

function readDefaultI18nConfig(imported: unknown, configPath: string): ExternalI18nConfig {
  const candidate = imported && typeof imported === "object"
  ? (imported as { default?: unknown }).default
  : undefined;

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`i18n config must default-export an object: ${configPath}`);
  }

  return candidate as ExternalI18nConfig;
}

function normalizeStringList(value: readonly string[] | string | undefined): string[] | undefined {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = Array.from(new Set(values.map(normalizeString).filter(Boolean)));
  return normalized.length ? normalized : undefined;
}

function normalizeString(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

export {
  applyProjectConfigsToFrontendBundlerOptions,
  loadFrontendProjectConfig,
};
