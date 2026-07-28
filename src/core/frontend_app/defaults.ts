const DEFAULT_FRONTEND_SOURCE_DIR = "src/frontend";
const DEFAULT_FRONTEND_PUBLIC_DIR = "public";
const DEFAULT_FRONTEND_CLIENT_ENTRY_KEY = "client";
const DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_KEY = "client-defer";
const DEFAULT_FRONTEND_GLOBAL_STYLE_RULE_KEY = "global-style";
const DEFAULT_FRONTEND_SSR_RULE_KEY = "ssr-pages";
const DEFAULT_FRONTEND_SSR_MAP_EXPORT = "modules";
const DEFAULT_FRONTEND_SSR_RESOLVER_EXPORT = "getModule";
const DEFAULT_FRONTEND_SSR_ROOT_EXPORT = "rootModule";
const DEFAULT_FRONTEND_SSR_MATCHED_EXPORT = "default";
const DEFAULT_FRONTEND_SSR_ROOT_MODULE_EXPORT = "default";

const DEFAULT_FRONTEND_GLOBAL_STYLE_PATTERNS = [
  "css/**/*.css",
  "css/**/*.scss",
  "components/**/styles.css",
  "components/**/styles.scss",
  "components/**/styles/**/*.css",
  "components/**/styles/**/*.scss",
  "js/**/styles.css",
  "js/**/styles.scss",
  "js/**/styles/**/*.css",
  "js/**/styles/**/*.scss",
] as const;

const DEFAULT_FRONTEND_GLOBAL_CLIENT_ENTRY_PATTERNS = [
  "js/**/*.client.ts",
  "js/**/*.client.tsx",
  "js/**/*.client.js",
  "js/**/*.client.jsx",
  "js/**/*.client.css",
  "js/**/*.client.scss",
  "js/**/*.client.defer.ts",
  "js/**/*.client.defer.tsx",
  "js/**/*.client.defer.js",
  "js/**/*.client.defer.jsx",
] as const;

const DEFAULT_FRONTEND_IGNORED_SOURCE_PATTERNS = [
  "**/*.d.ts",
  "**/*.d.mts",
  "**/*.d.cts",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.test.js",
  "**/*.test.jsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/*.spec.js",
  "**/*.spec.jsx",
  "**/_*.scss",
] as const;

const DEFAULT_FRONTEND_RUNTIME_SOURCE_PATTERNS = [
  "layouts/**/*.ts",
  "layouts/**/*.tsx",
  "layouts/**/*.js",
  "layouts/**/*.jsx",
  "pages/**/*.ts",
  "pages/**/*.tsx",
  "pages/**/*.js",
  "pages/**/*.jsx",
  "**/*.server.ts",
  "**/*.server.tsx",
  "**/*.server.js",
  "**/*.server.jsx",
  "**/*.ssr.ts",
  "**/*.ssr.tsx",
  "**/*.ssr.js",
  "**/*.ssr.jsx",
] as const;

const DEFAULT_FRONTEND_SSR_PAGE_PATTERNS = [
  "pages/**/*.ts",
  "pages/**/*.tsx",
  "pages/**/*.js",
  "pages/**/*.jsx",
] as const;

export {
  DEFAULT_FRONTEND_CLIENT_ENTRY_KEY,
  DEFAULT_FRONTEND_DEFERRED_CLIENT_ENTRY_KEY,
  DEFAULT_FRONTEND_GLOBAL_CLIENT_ENTRY_PATTERNS,
  DEFAULT_FRONTEND_GLOBAL_STYLE_PATTERNS,
  DEFAULT_FRONTEND_GLOBAL_STYLE_RULE_KEY,
  DEFAULT_FRONTEND_IGNORED_SOURCE_PATTERNS,
  DEFAULT_FRONTEND_PUBLIC_DIR,
  DEFAULT_FRONTEND_RUNTIME_SOURCE_PATTERNS,
  DEFAULT_FRONTEND_SOURCE_DIR,
  DEFAULT_FRONTEND_SSR_PAGE_PATTERNS,
  DEFAULT_FRONTEND_SSR_MAP_EXPORT,
  DEFAULT_FRONTEND_SSR_MATCHED_EXPORT,
  DEFAULT_FRONTEND_SSR_RESOLVER_EXPORT,
  DEFAULT_FRONTEND_SSR_ROOT_EXPORT,
  DEFAULT_FRONTEND_SSR_ROOT_MODULE_EXPORT,
  DEFAULT_FRONTEND_SSR_RULE_KEY,
};
