import path from "node:path";

import { VIRTUAL_ENTRY_PREFIX } from "../discovery/shared.js";
import type { BundlerEntryRecord } from "#3c8d8166992a";

const CLIENT_ROOT_RULE_KEY = "client-root";
const CLIENT_ENTRY_RULE_KEY = CLIENT_ROOT_RULE_KEY;
const CLIENT_ENTRY_KEY = "client-root:entry";
const CLIENT_ENTRY_NAME = "index.client";
const CLIENT_ENTRY_VIRTUAL_NAME = CLIENT_ENTRY_NAME;
const CLIENT_ENTRY_VIRTUAL_PATH = `${VIRTUAL_ENTRY_PREFIX}${CLIENT_ENTRY_VIRTUAL_NAME}`;

type ClientEntryOptions = {
  clientRoot: string;
  iconMode?: string;
  rootDir: string;
  rootId?: string;
  staticIcons?: boolean;
};

function toModuleSpecifier(rootDir: string, clientRoot: string): string {
  const absolute = path.isAbsolute(clientRoot)
  ? clientRoot
  : path.resolve(rootDir, clientRoot);
  return absolute.split(path.sep).join("/");
}

function renderClientEntrySource(options: ClientEntryOptions): string {
  const rootId = String(options.rootId || "root");
  const specifier = toModuleSpecifier(options.rootDir, options.clientRoot);
  const iconMode = String(options.iconMode || "server");
  const lines = [
    'import { bindFrontendRuntime } from "@trebired/frontend";',
  ];
  if (options.staticIcons) lines.push('import "@trebired/frontend/static-icons";');
  lines.push(
    'import { createElement } from "react";',
    'import { createRoot } from "react-dom/client";',
    `import RootComponent from ${JSON.stringify(specifier)};`,
    "",
    `const container = document.getElementById(${JSON.stringify(rootId)});`,
    "if (container) {",
    "  createRoot(container).render(createElement(RootComponent));",
    "}",
    `bindFrontendRuntime(document, { icons: { mode: ${JSON.stringify(iconMode)} } });`,
    "",
  );
  return lines.join("\n");
}

function createClientEntryRecord(options: ClientEntryOptions): BundlerEntryRecord {
  const source = toModuleSpecifier(options.rootDir, options.clientRoot);
  return {
    contents: renderClientEntrySource(options),
    entrySource: source,
    generated: true,
    key: CLIENT_ENTRY_KEY,
    kind: "entry",
    name: CLIENT_ENTRY_NAME,
    ownedSources: [source],
    path: CLIENT_ENTRY_VIRTUAL_PATH,
    ruleKey: CLIENT_ENTRY_RULE_KEY,
    source: "internal",
    strategy: "entry",
    virtualLoader: "ts",
  } as BundlerEntryRecord;
}

export {
  appendClientRootEntry,
  CLIENT_ROOT_RULE_KEY,
  withClientRootIgnored,
  CLIENT_ENTRY_KEY,
  CLIENT_ENTRY_NAME,
  CLIENT_ENTRY_VIRTUAL_PATH,
  createClientEntryRecord,
  renderClientEntrySource,
};
export type { ClientEntryOptions };

async function appendClientRootEntry<T extends { entries: readonly unknown[] }>(
  discovery: T,
  options: { clientRoot?: string; rootId?: string } | undefined,
  normalized: { environment?: string; rootDir: string },
  logger: { info: (group: string, message: string) => void },
): Promise<T> {
  const clientRoot = String(options?.clientRoot || "").trim();
  if (!clientRoot || normalized.environment === "node") return discovery;

  let iconMode = "server";
  let staticIcons = false;
  try {
    const { resolveFrontendIconMode } = await import("../frontend-config.js");
    iconMode = await resolveFrontendIconMode(normalized.rootDir);
    staticIcons = iconMode === "static";
  } catch {
    iconMode = "server";
  }

  const entry = createClientEntryRecord({
      clientRoot,
      iconMode,
      rootDir: normalized.rootDir,
      rootId: options?.rootId,
      staticIcons,
  });
  logger.info("client", `client-root :: synthesized entry icons=${iconMode}`);
  return {
    ...discovery,
    entries: [
      ...(discovery.entries as Array<{ key?: string }>).filter((item) => item.key !== entry.key),
      entry,
    ].sort((a, b) => String((a as { key?: string }).key).localeCompare(String((b as { key?: string }).key))),
  } as T;
}

const CLIENT_ROOT_IGNORE_RULE_KEY = "client-root-source";

/**
 * The root component is consumed by the synthesized entry, so discovery must not
 * treat it as an unmatched source file.
 */
function withClientRootIgnored<T extends { clientRoot?: string; discover?: unknown }>(
  options: T,
  rootDir: string,
): T {
  const clientRoot = String(options?.clientRoot || "").trim();
  if (!clientRoot) return options;
  const configs = Array.isArray(options.discover) ? options.discover : [options.discover];
  const next = configs.map((config) => {
      if (!config || typeof config !== "object") return config;
      const entry = config as { dir?: string; rules?: unknown[] };
      const dir = String(entry.dir || "").replace(/^\.\/+/, "");
      const absolute = path.isAbsolute(clientRoot)
      ? clientRoot
      : path.resolve(rootDir, clientRoot);
      const relative = path.relative(path.resolve(rootDir, dir), absolute)
      .split(path.sep)
      .join("/");
      if (!relative || relative.startsWith("..")) return config;
      const rules = Array.isArray(entry.rules) ? entry.rules : [];
      if (rules.some((rule) => (rule as { key?: string })?.key === CLIENT_ROOT_IGNORE_RULE_KEY)) {
        return config;
      }
      return {
        ...entry,
        rules: [
          { include: [relative], key: CLIENT_ROOT_IGNORE_RULE_KEY, strategy: "ignore" },
          ...rules,
        ],
      };
  });
  return {
    ...options,
    discover: Array.isArray(options.discover) ? next : next[0],
  };
}
