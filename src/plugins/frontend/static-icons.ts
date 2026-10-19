import type { Plugin } from "esbuild";

import { resolveFrontendStaticIcons } from "#d0ppiu0440kk";
import type { NormalizedBundlerLogger } from "#3c8d8166992a";

const STATIC_ICONS_NAMESPACE = "package-frontend-static-icons";
const STATIC_ICONS_SPECIFIER = "@trebired/frontend/static-icons";
const STATIC_ICONS_FILTER = /^@trebired\/frontend\/static-icons$/;

type FrontendStaticIconsPluginOptions = {
  environment?: string;
  logger: NormalizedBundlerLogger;
  rootDir: string;
};

function createFrontendStaticIconsPlugin(
  options: FrontendStaticIconsPluginOptions,
): Plugin {
  let cached: string | null = null;
  return {
    name: STATIC_ICONS_NAMESPACE,
    setup(build) {
      build.onResolve({ filter: STATIC_ICONS_FILTER }, (args) => {
          if (args.path !== STATIC_ICONS_SPECIFIER) return null;
          if (options.environment === "node") return null;
          return { namespace: STATIC_ICONS_NAMESPACE, path: STATIC_ICONS_SPECIFIER };
      });

      build.onLoad({ filter: /.*/, namespace: STATIC_ICONS_NAMESPACE }, async() => {
          if (cached === null) {
            try {
              const resolved = await resolveFrontendStaticIcons(options.rootDir);
              cached = resolved.contents;
              options.logger.info(
                "icons",
                `static-icons :: virtual cached=${resolved.count}`,
              );
            } catch (error) {
              options.logger.warn(
                "icons",
                `static-icons :: generation failed :: ${String((error as Error)?.message || error)}`,
              );
              cached = "export {};\n";
            }
          }
          return { contents: cached, loader: "js", resolveDir: options.rootDir };
      });
    },
  };
}

export { STATIC_ICONS_SPECIFIER, createFrontendStaticIconsPlugin };
export type { FrontendStaticIconsPluginOptions };
