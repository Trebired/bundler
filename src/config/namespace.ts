import type {
  BundlerDataAttrsInput,
  BundlerDataAttrsOutput,
  BundlerNamespace,
  BundlerProjectConfig,
  NormalizedBundlerProjectConfig,
} from "#6wgcj9fvnm87";

function normalizeBundlerPrefix(value: unknown, label = "prefix"): string {
  if (value === false || value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error(`${label} must be a string or false`);
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.startsWith(".") ? trimmed.slice(1) : trimmed;
  if (!/^[a-z][a-z0-9_-]*$/iu.test(normalized)) {
    throw new Error(`${label} must start with a letter and contain only letters, numbers, underscores, or hyphens`);
  }
  return normalized;
}

function namespaceName(name: string): string {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) throw new Error("namespace name must be a non-empty string");
  return normalizedName;
}

function prefixedName(prefix: string, name: string): string {
  const normalizedName = namespaceName(name);
  return prefix ? `${prefix}-${normalizedName}` : normalizedName;
}

function selectorValue(value: string | number | boolean): string {
  return String(value).replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"");
}

function createBundlerNamespace(config: BundlerProjectConfig | NormalizedBundlerProjectConfig = {}): BundlerNamespace {
  const prefix = normalizeBundlerPrefix(config.prefix);
  const helper = {
    className(name: string) {
      return prefixedName(prefix, name);
    },
    cssVar(name: string) {
      return `--${prefixedName(prefix, name)}`;
    },
    cssVarRef(name: string, fallback?: string) {
      const variable = `var(${helper.cssVar(name)}`;
      return fallback === undefined ? `${variable})` : `${variable}, ${fallback})`;
    },
    dataAttr(name: string) {
      return `data-${prefixedName(prefix, name)}`;
    },
    dataAttrs(input: BundlerDataAttrsInput) {
      return Object.fromEntries(
        Object.entries(input).map(([name, value]) => [helper.dataAttr(name), value]),
      ) as BundlerDataAttrsOutput;
    },
    dataSelector(name: string, value?: string | number | boolean) {
      const attr = helper.dataAttr(name);
      return value === undefined ? `[${attr}]` : `[${attr}="${selectorValue(value)}"]`;
    },
    elementClass(block: string, element: string) {
      return `${prefixedName(prefix, block)}__${namespaceName(element)}`;
    },
    eventName(name: string) {
      const normalizedName = namespaceName(name);
      return prefix ? `${prefix}:${normalizedName}` : normalizedName;
    },
    modifierClass(block: string, modifier: string) {
      return `${prefixedName(prefix, block)}--${namespaceName(modifier)}`;
    },
    token(name: string) {
      return prefixedName(prefix, name);
    },
    prefix,
  };
  return helper;
}

export {
  createBundlerNamespace,
  namespaceName,
  normalizeBundlerPrefix,
  prefixedName,
};
