import path from "node:path";

import type { NormalizedBundlerI18nOptions } from "#3c8d8166992a";
import { resolveI18nFolder } from "./validate.js";
import type { ResolvedI18nFolder } from "./validate.js";
import {
  escapeRegExp,
  I18N_PACKAGE_NAME,
  sanitizeBindingSegment,
  toRelativeImport,
} from "./shared.js";

type I18nTransformResult = {
  contents: string;
  folder: ResolvedI18nFolder;
};

async function transformLocalTranslators(args: {
    callerPath: string;
    i18n: NormalizedBundlerI18nOptions;
    rootDir: string;
    source: string;
}): Promise<I18nTransformResult | undefined> {
  const localNames = findLocalTranslatorBindings(args.source);
  if (localNames.length === 0 || !hasLocalTranslatorCall(args.source, localNames)) return undefined;

  const folder = await resolveI18nFolder(args);
  const transformed = buildTransformedSource({
      callerPath: args.callerPath,
      folder,
      localNames,
      source: args.source,
  });

  return { contents: transformed, folder };
}

function buildTransformedSource(args: {
    callerPath: string;
    folder: ResolvedI18nFolder;
    localNames: string[];
    source: string;
}): string {
  const translatorBinding = uniqueBinding("__package_i18n_createTranslator", args.source);
  const moduleBindings = args.folder.modules.map((item) => ({
        ...item,
        binding: uniqueBinding(`__package_i18n_${sanitizeBindingSegment(item.language)}`, args.source),
  }));
  const imports = buildStaticImports(args.callerPath, translatorBinding, moduleBindings);
  const bundleExpression = `{ ${moduleBindings.map((item) => `${JSON.stringify(item.language)}: ${item.binding}`).join(", ")} }`;
  const contents = replaceLocalTranslatorCalls(args.source, args.localNames, translatorBinding, bundleExpression);
  return `${imports}\n${contents}`;
}

function buildStaticImports(
  callerPath: string,
  translatorBinding: string,
  modules: Array<{ binding: string; filePath: string }>,
): string {
  const callerDir = path.dirname(callerPath);
  const lines = [
    `import { createTranslator as ${translatorBinding} } from ${JSON.stringify(I18N_PACKAGE_NAME)};`,
  ];
  for (const item of modules) {
    const specifier = toRelativeImport(path.relative(callerDir, item.filePath));
    lines.push(`import ${item.binding} from ${JSON.stringify(specifier)};`);
  }
  return lines.join("\n");
}

function replaceLocalTranslatorCalls(
  source: string,
  localNames: string[],
  translatorBinding: string,
  bundleExpression: string,
): string {
  let transformed = source;
  for (const localName of localNames) {
    const pattern = localTranslatorCallPattern(localName);
    transformed = transformed.replace(pattern, (_match, prefix) => `${prefix}${translatorBinding}(${bundleExpression},`);
  }
  return transformed;
}

function findLocalTranslatorBindings(source: string): string[] {
  const names = new Set<string>();
  const pattern = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*["']${escapeRegExp(I18N_PACKAGE_NAME)}["']`, "gu");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    for (const specifier of match[1].split(",")) {
      const localName = parseLocalTranslatorSpecifier(specifier);
      if (localName) names.add(localName);
    }
  }

  return Array.from(names);
}

function parseLocalTranslatorSpecifier(specifier: string): string {
  const parts = specifier.trim().split(/\s+as\s+/u).map((part) => part.trim()).filter(Boolean);
  if (parts[0] !== "createLocalTranslator") return "";
  return parts[1] || parts[0];
}

function hasLocalTranslatorCall(source: string, localNames: string[]): boolean {
  return localNames.some((localName) => localTranslatorCallPattern(localName).test(source));
}

function localTranslatorCallPattern(localName: string): RegExp {
  return new RegExp(`(^|[^A-Za-z0-9_$.])${escapeRegExp(localName)}\\s*\\(\\s*import\\.meta\\.url\\s*,`, "gu");
}

function uniqueBinding(base: string, source: string): string {
  let candidate = base;
  let index = 2;
  while (new RegExp(`\\b${escapeRegExp(candidate)}\\b`, "u").test(source)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  return candidate;
}

export {
  findLocalTranslatorBindings,
  transformLocalTranslators,
};
export type {
  I18nTransformResult,
};
