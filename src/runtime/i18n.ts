import fs from "node:fs/promises";
import path from "node:path";

import type { BundlerI18nOptions, NormalizedBundlerI18nOptions } from "#3c8d8166992a";
import { normalizeBundlerI18nOptions } from "#6oq2v2e7vq0l";
import { loadFrontendProjectConfig } from "#q8c0qk6kt8h7";
import { escapeRegExp, resolveCodeLoader } from "#15qndurz5u8q";
import { transformLocalTranslators } from "#n2jhviy4ya88";

type RuntimeI18nOptions = {
  i18n?: BundlerI18nOptions | boolean;
  rootDir?: string;
};

type RuntimeI18nRegistration = {
  enabled: boolean;
  rootDir: string;
};

type RuntimeLoaderArgs = { path: string };

const registeredRoots = new Set<string>();

function runtimeCodeFilter(rootDir: string): RegExp {
  const root = escapeRegExp(rootDir.replace(/\\/gu, "/").replace(/\/+$/u, ""));
  return new RegExp(`^${root}/(?!node_modules/)(?!.*\\.d\\.[cm]?[jt]s$).*\\.(?:[cm]?[jt]sx?)$`, "u");
}

async function resolveRuntimeI18nOptions(rootDir: string, input: RuntimeI18nOptions["i18n"]) {
  const configured = input === undefined ? (await loadFrontendProjectConfig(rootDir)).i18n : input;
  return normalizeBundlerI18nOptions(configured);
}

function createRuntimeLoader(rootDir: string, i18n: NormalizedBundlerI18nOptions) {
  return async function loadRuntimeModule(args: RuntimeLoaderArgs) {
    const source = await fs.readFile(args.path, "utf8");
    const transformed = await transformLocalTranslators({ callerPath: args.path, i18n, rootDir, source });
    return { contents: transformed ? transformed.contents : source, loader: resolveCodeLoader(args.path) };
  };
}

async function registerRuntimeI18n(options: RuntimeI18nOptions = {}): Promise<RuntimeI18nRegistration> {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const i18n = await resolveRuntimeI18nOptions(rootDir, options.i18n);
  if (!i18n.enabled) return { enabled: false, rootDir };
  if (registeredRoots.has(rootDir)) return { enabled: true, rootDir };
  registeredRoots.add(rootDir);
  const load = createRuntimeLoader(rootDir, i18n);
  Bun.plugin({
      name: "package-i18n-runtime",
      setup(build) {
        build.onLoad({ filter: runtimeCodeFilter(rootDir) }, load as any);
      },
  });
  return { enabled: true, rootDir };
}

export type { RuntimeI18nOptions, RuntimeI18nRegistration };
export { registerRuntimeI18n };
