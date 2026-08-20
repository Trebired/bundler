import path from "node:path";

import type {
  BundlerBunStaticAssetHandler,
  BundlerBunStaticAssetHandlerOptions,
  BundlerStaticAssetRequest,
  BundlerStaticAssetResponse,
} from "#3c8d8166992a";
import { serveStaticAsset } from "./static.js";

function createBunStaticAssetHandler(
  options: BundlerBunStaticAssetHandlerOptions,
): BundlerBunStaticAssetHandler {
  return async function bunStaticAssetHandler(request: Request): Promise<Response> {
    const asset = await serveStaticAsset(toStaticAssetRequest(request), options);
    if (asset) return toBunResponse(asset, request);
    const fallbackPath = resolveSpaFallbackPath(request, options);
    if (fallbackPath) {
      const fallback = await serveStaticAsset(
        { headers: request.headers, method: request.method, url: fallbackPath },
        options,
      );
      if (fallback) return toBunResponse(fallback, request);
    }
    return new Response(options.notFoundBody || "Not Found", {
        headers: options.notFoundHeaders,
        status: 404,
    });
  };
}

function toStaticAssetRequest(request: Request): BundlerStaticAssetRequest {
  return {
    headers: request.headers,
    method: request.method,
    url: new URL(request.url).pathname,
  };
}

function toBunResponse(
  asset: BundlerStaticAssetResponse,
  request: Request,
): Response {
  const body = request.method.toUpperCase() === "HEAD" ? null : asset.body || null;
  return new Response(body, { headers: asset.headers, status: asset.status });
}

function resolveSpaFallbackPath(
  request: Request,
  options: BundlerBunStaticAssetHandlerOptions,
): string {
  if (options.spaFallback === false) return "";
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return "";
  const pathname = new URL(request.url).pathname;
  if (path.posix.extname(pathname)) return "";
  const accept = request.headers.get("accept") || "";
  if (accept && !/(?:text\/html|\*\/\*)/iu.test(accept)) return "";
  return String(options.spaFallback || "index.html");
}

export {
  createBunStaticAssetHandler,
};
export type {
  BundlerBunStaticAssetHandler,
  BundlerBunStaticAssetHandlerOptions,
};
