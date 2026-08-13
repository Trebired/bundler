import type { BundlerOptions, NormalizedBundlerI18nOptions } from "#3c8d8166992a";
import { normalizeI18nLanguage as normalizeLanguage } from "./i18n/shared.js";

const DEFAULT_I18N_DIR_NAME = "i18n";
const DEFAULT_I18N_EXTENSION = ".ts";
const DEFAULT_I18N_FALLBACK_LANGUAGE = "en";

function normalizeBundlerI18nOptions(
  value: BundlerOptions["i18n"],
): NormalizedBundlerI18nOptions {
  if (!value) {
    return disabledI18nOptions();
  }

  const input = typeof value === "object" ? value : {};
  const defaultLanguage = normalizeLanguage(input.defaultLanguage || DEFAULT_I18N_FALLBACK_LANGUAGE);

  return {
    defaultLanguage,
    dirName: normalizeSegment(input.dirName) || DEFAULT_I18N_DIR_NAME,
    enabled: input.enabled !== false,
    extensions: normalizeExtensions(input.extensions),
    logLabel: normalizeSegment(input.logLabel),
    supportedLanguages: normalizeSupportedLanguages(input.supportedLanguages, defaultLanguage),
  };
}

function disabledI18nOptions(): NormalizedBundlerI18nOptions {
  return {
    defaultLanguage: DEFAULT_I18N_FALLBACK_LANGUAGE,
    dirName: DEFAULT_I18N_DIR_NAME,
    enabled: false,
    extensions: [DEFAULT_I18N_EXTENSION],
    logLabel: "",
  };
}

function normalizeSupportedLanguages(
  value: readonly string[] | undefined,
  defaultLanguage: string,
): string[] | undefined {
  const languages = Array.from(new Set((value || []).map(normalizeLanguage).filter(Boolean)));
  if (languages.length === 0) return undefined;
  return languages.includes(defaultLanguage) ? languages : [defaultLanguage, ...languages];
}

function normalizeExtensions(value: string[] | undefined): string[] {
  const extensions = Array.from(new Set((value || [DEFAULT_I18N_EXTENSION]).map((item) => {
          const normalized = normalizeSegment(item);
          return normalized ? normalized.startsWith(".") ? normalized : `.${normalized}` : "";
      }).filter(Boolean)));

  return extensions.length > 0 ? extensions : [DEFAULT_I18N_EXTENSION];
}

function normalizeSegment(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export {
  DEFAULT_I18N_DIR_NAME,
  DEFAULT_I18N_EXTENSION,
  DEFAULT_I18N_FALLBACK_LANGUAGE,
  normalizeBundlerI18nOptions,
  normalizeLanguage,
};
