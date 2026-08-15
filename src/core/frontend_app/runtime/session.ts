import path from "node:path";

import type {
  BundlerFrontendAppBundlerConfig,
  BundlerFrontendAppBundlerConfigOptions,
  BundlerFrontendBuildResult,
  BundlerFrontendRuntimeConfig,
  BundlerFrontendRuntimeSession,
  BundlerFrontendRuntimeSessionOptions,
} from "#3c8d8166992a";
import { buildFrontendApp } from "#omrw7gbfx3rk";
import {
  createFrontendAppBundlerOptions,
  createFrontendBundlerRuntimeConfig,
} from "#tjhgcgqdt4ba";
import { createFrontendBundlerRuntime } from "#nk24fc28wksn";

async function createFrontendBundlerRuntimeSession(
  input:
  BundlerFrontendAppBundlerConfig |
  BundlerFrontendAppBundlerConfigOptions,
  options: BundlerFrontendRuntimeSessionOptions = {},
): Promise<BundlerFrontendRuntimeSession> {
  const { config } = createFrontendAppBundlerOptions(input);
  const buildResult = await runSessionBuild(config, options);
  const runtime = createFrontendBundlerRuntime(
    createSessionRuntimeConfig(config, options),
  );
  if (options.ensure !== false) await runtime.ensure();

  return {
    buildResult,
    clientDistAbs: path.resolve(config.rootDir, config.clientOutDir),
    config,
    mode: config.mode,
    publicDirAbs: config.publicDir
    ? path.resolve(config.rootDir, config.publicDir)
    : "",
    runtime,
  };
}

async function runSessionBuild(
  config: BundlerFrontendAppBundlerConfig,
  options: BundlerFrontendRuntimeSessionOptions,
): Promise<BundlerFrontendBuildResult|undefined> {
  if (
    config.mode !== "development" ||
      options.developmentStrategy !== "build"
  ) {
    return undefined;
  }

  return await buildFrontendApp(config);
}

function createSessionRuntimeConfig(
  config: BundlerFrontendAppBundlerConfig,
  options: BundlerFrontendRuntimeSessionOptions,
): BundlerFrontendRuntimeConfig {
  const runtimeConfig = createFrontendBundlerRuntimeConfig(config);
  if (
    config.mode === "development" &&
      options.developmentStrategy === "build"
  ) {
    return {
      ...runtimeConfig,
      mode: "production",
    };
  }

  return runtimeConfig;
}

export {
  createFrontendBundlerRuntimeSession,
};
