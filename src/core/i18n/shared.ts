function normalizeI18nLanguage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/_/gu, "-");
}

export { normalizeI18nLanguage };
