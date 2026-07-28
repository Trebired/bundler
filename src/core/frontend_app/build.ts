import fs from "node:fs/promises";
import path from "node:path";

import type {
  BundlerFrontendAppBundlerConfig,
  BundlerFrontendBuildOptions,
  BundlerFrontendBuildTarget,
  BundlerFrontendBuildResult,
} from "#3c8d8166992a";
import { bundle } from "#9b50ca986572";
import { createFrontendAppBundlerOptions } from "./config.js";
import { resolveConfiguredFrontendGlobalClientEntries } from "./global.js";
import { resolveAssetManifestEntryOutputPath } from "./manifest.js";
import { prepareSsrNodeModules } from "./node_modules.js";
import { buildRelatedClientEntryMap } from "./related.js";

async function buildFrontendApp(
  options: BundlerFrontendBuildOptions | BundlerFrontendAppBundlerConfig,
): Promise<BundlerFrontendBuildResult> {
  const target = resolveBuildTarget(options);
  const { client, config, ssr } = createFrontendAppBundlerOptions(options);
  const clientResult = target !== "ssr" ? await bundle(client) : undefined;
  const publicDirCopied = clientResult ? await copyPublicDir(config) : false;
  const ssrResult = target !== "client" && ssr ? await bundle(ssr) : undefined;
  const relatedClientEntryMap = await resolveBuildRelatedClientEntryMap(config, ssrResult);
  const ssrEntryOutput = resolveBuildSsrEntryOutput(config, ssrResult);
  const nodeModules = ssrResult ? await prepareSsrNodeModules(config, config.nodeModules) : undefined;
  const globalClientEntries = resolveConfiguredFrontendGlobalClientEntries(config, clientResult?.assetManifest);

  return {
    client: clientResult,
    globalClientEntries,
    nodeModules,
    publicDirCopied,
    relatedClientEntryMap,
    ssr: ssrResult,
    ssrEntryOutput,
    stats: { precompressed: clientResult?.precompressed },
  };
}

function resolveBuildTarget(
  options: BundlerFrontendBuildOptions | BundlerFrontendAppBundlerConfig,
): BundlerFrontendBuildTarget {
  if ("target" in options && options.target) return options.target;
  return "all";
}

async function copyPublicDir(config: BundlerFrontendAppBundlerConfig): Promise<boolean> {
  if (!config.publicDir) return false;
  const sourceDir = path.resolve(config.rootDir, config.publicDir);
  if (!await exists(sourceDir)) return false;
  const targetDir = path.resolve(config.rootDir, config.clientOutDir);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.cp(sourceDir, targetDir, { recursive: true, force: true });
  return true;
}

async function resolveBuildRelatedClientEntryMap(
  config: BundlerFrontendAppBundlerConfig,
  ssrResult: Awaited<ReturnType<typeof bundle>> | undefined,
): Promise<Record<string, string[]>> {
  if (!ssrResult?.assetManifest || !config.ssr) return {};
  return buildRelatedClientEntryMap({
    manifest: ssrResult.assetManifest,
    pageId: { collapseIndex: config.ssr.collapseIndex, sourcePrefix: `${config.frontendDir}/pages` },
    rootDir: config.rootDir,
    ruleKey: config.ssr.key,
  });
}

function resolveBuildSsrEntryOutput(
  config: BundlerFrontendAppBundlerConfig,
  ssrResult: Awaited<ReturnType<typeof bundle>> | undefined,
): string | undefined {
  if (!ssrResult?.assetManifest || !config.ssr || !config.ssrOutDir) return undefined;
  return resolveAssetManifestEntryOutputPath({
    entryId: config.ssr.key,
    from: "ruleKey",
    manifest: ssrResult.assetManifest,
    outDir: path.resolve(config.rootDir, config.ssrOutDir),
  });
}

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true, () => false);
}

export {
  buildFrontendApp,
  copyPublicDir,
};
