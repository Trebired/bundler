type BundlerI18nOptions = {
  defaultLanguage?: string;
  dirName?: string;
  enabled?: boolean;
  extensions?: string[];
  supportedLanguages?: readonly string[];
};

type NormalizedBundlerI18nOptions = {
  defaultLanguage: string;
  dirName: string;
  enabled: boolean;
  extensions: string[];
  supportedLanguages?: string[];
};

export type {
  BundlerI18nOptions,
  NormalizedBundlerI18nOptions,
};
