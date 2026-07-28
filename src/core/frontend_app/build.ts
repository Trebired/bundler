import fs from "node:fs/promises";
import path from "node:path";

import type {
  BundlerFrontendAppBundlerConfig,
  BundlerFrontendBuildOptions,
  BundlerFrontendBuildResult,
  BundlerSsrNodeModulesOptions,
} from "#3c8d8166992a";
import { bundle } from "#9b50ca986572";
import { createFrontendAppBundlerOptions } from "./config.js";
import { resolveAssetManifestEntryOutputPath } from "./manifest.js";
import { buildRelatedClientEntryMap } from "./related.js";

async function buildFrontendApp(
  options: BundlerFrontendBuildOptions | BundlerFrontendAppBundlerConfig,
): Promise<BundlerFrontendBuildResult> {
  const nodeModulesOptions = "nodeModules" in options ? options.nodeModules : undefined;
  const { client, config, ssr } = createFrontendAppBundlerOptions(options);
  const clientResult = await bundle(client);
  const publicDirCopied = await copyPublicDir(config);
  const ssrResult = ssr ? await bundle(ssr) : undefined;
  const relatedClientEntryMap = await resolveBuildRelatedClientEntryMap(config, ssrResult);
  const ssrEntryOutput = resolveBuildSsrEntryOutput(config, ssrResult);
  const nodeModules = ssrResult ? await prepareSsrNodeModules(config, nodeModulesOptions) : undefined;

  return {
    client: clientResult,
    nodeModules,
    publicDirCopied,
    relatedClientEntryMap,
    ssr: ssrResult,
    ssrEntryOutput,
    stats: { precompressed: clientResult.precompressed },
  };
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

async function prepareSsrNodeModules(
  config: BundlerFrontendAppBundlerConfig,
  options: BundlerSsrNodeModulesOptions | undefined,
): Promise<BundlerFrontendBuildResult["nodeModules"]> {
  const strategy = options?.strategy || "none";
  if (strategy === "none" || !config.ssrOutDir) return undefined;
  const sourceDir = path.resolve(config.rootDir, options?.sourceDir || "node_modules");
  const targetDir = path.resolve(config.rootDir, options?.targetDir || path.join(config.ssrOutDir, "node_modules"));
  if (options?.force) await fs.rm(targetDir, { force: true, recursive: true });
  if (strategy === "symlink") await createNodeModulesSymlink(sourceDir, targetDir);
  else await fs.cp(sourceDir, targetDir, { recursive: true, force: true });
  return { path: targetDir, strategy };
}

async function createNodeModulesSymlink(sourceDir: string, targetDir: string): Promise<void> {
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.symlink(sourceDir, targetDir, "junction").catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
}

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true, () => false);
}

export {
  buildFrontendApp,
  copyPublicDir,
};
