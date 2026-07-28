import fs from "node:fs/promises";
import path from "node:path";

import type {
  BundlerExpressLikeNext,
  BundlerExpressLikeRequest,
  BundlerExpressLikeResponse,
  BundlerStaticAssetDir,
  BundlerStaticAssetHandlerOptions,
  BundlerStaticAssetRequest,
  BundlerStaticAssetResponse,
} from "#3c8d8166992a";
import { normalizePathValue } from "#tsnh4vdfql8p";

type StaticFileMatch = {
  absPath: string;
  requestPath: string;
};

async function serveStaticAsset(
  request: BundlerStaticAssetRequest,
  options: BundlerStaticAssetHandlerOptions,
): Promise<BundlerStaticAssetResponse | undefined> {
  const requestPath = normalizeRequestPath(request.path || request.url || "");
  if (!requestPath) return undefined;
  if (isBlockedRequest(requestPath, options)) return createBlockedResponse(options);

  const match = await resolveStaticFile(requestPath, options);
  if (!match) return undefined;
  const selected = await selectPrecompressedFile(match, request);
  const body = await fs.readFile(selected.absPath);
  return {
    body,
    headers: createAssetHeaders({
      compressedEncoding: selected.encoding,
      mode: options.mode || "production",
      requestPath: match.requestPath,
    }),
    status: 200,
  };
}

function createStaticAssetMiddleware(options: BundlerStaticAssetHandlerOptions) {
  return async (
    request: BundlerExpressLikeRequest,
    response: BundlerExpressLikeResponse,
    next: BundlerExpressLikeNext,
  ): Promise<void> => {
    try {
      const asset = await serveStaticAsset(request, options);
      if (!asset) {
        next();
        return;
      }
      response.statusCode = asset.status;
      Object.entries(asset.headers).forEach(([key, value]) => response.setHeader(key, value));
      response.end(asset.body || "");
    } catch (error) {
      next(error);
    }
  };
}

async function resolveStaticFile(
  requestPath: string,
  options: BundlerStaticAssetHandlerOptions,
): Promise<StaticFileMatch | undefined> {
  for (const dir of resolveStaticDirs(options)) {
    const mountedPath = toMountedRequestPath(requestPath, dir.mountPath);
    if (!mountedPath) continue;
    const absPath = path.resolve(dir.dir, mountedPath);
    if (!isInsideDir(absPath, dir.dir)) continue;
    if (await isFile(absPath)) return { absPath, requestPath: mountedPath };
  }
  return undefined;
}

async function selectPrecompressedFile(
  match: StaticFileMatch,
  request: BundlerStaticAssetRequest,
): Promise<{ absPath: string; encoding?: "br" | "gzip" }> {
  if (!supportsPrecompression(match.requestPath)) return { absPath: match.absPath };
  const acceptEncoding = getHeader(request.headers, "accept-encoding");
  if (/\bbr\b/iu.test(acceptEncoding) && await isFile(`${match.absPath}.br`)) {
    return { absPath: `${match.absPath}.br`, encoding: "br" };
  }
  if (/\bgzip\b/iu.test(acceptEncoding) && await isFile(`${match.absPath}.gz`)) {
    return { absPath: `${match.absPath}.gz`, encoding: "gzip" };
  }
  return { absPath: match.absPath };
}

function createAssetHeaders(args: {
  compressedEncoding?: "br" | "gzip";
  mode: "development" | "production";
  requestPath: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Cache-Control": resolveCacheControl(args.mode, args.requestPath),
    "Content-Type": resolveContentType(args.requestPath),
    "X-Content-Type-Options": "nosniff",
  };
  if (supportsPrecompression(args.requestPath)) headers.Vary = "Accept-Encoding";
  if (args.compressedEncoding) headers["Content-Encoding"] = args.compressedEncoding;
  return headers;
}

function resolveStaticDirs(options: BundlerStaticAssetHandlerOptions): Array<{ dir: string; mountPath: string }> {
  const dirs: Array<{ dir: string; mountPath: string }> = [];
  if (options.mode === "development" && options.publicDir) dirs.push({ dir: path.resolve(options.publicDir), mountPath: "" });
  dirs.push(...(options.extraStaticDirs || []).map(normalizeStaticDir));
  dirs.push({ dir: path.resolve(options.clientOutDir), mountPath: "" });
  return dirs;
}

function normalizeStaticDir(value: BundlerStaticAssetDir): { dir: string; mountPath: string } {
  if (typeof value === "string") return { dir: path.resolve(value), mountPath: "" };
  return { dir: path.resolve(value.dir), mountPath: normalizePathValue(value.mountPath || "") };
}

function normalizeRequestPath(value: string): string {
  const rawPath = value.startsWith("/") || value.startsWith("http") ? value : `/${value}`;
  const pathname = new URL(rawPath, "http://localhost").pathname;
  const decoded = decodeURIComponent(pathname).replace(/\\/gu, "/");
  if (decoded.split("/").includes("..")) return "";
  return normalizePathValue(path.posix.normalize(decoded)) || "index.html";
}

function toMountedRequestPath(requestPath: string, mountPath: string): string {
  if (!mountPath) return requestPath;
  if (requestPath === mountPath) return "index.html";
  return requestPath.startsWith(`${mountPath}/`) ? requestPath.slice(mountPath.length + 1) : "";
}

function isBlockedRequest(requestPath: string, options: BundlerStaticAssetHandlerOptions): boolean {
  if (options.blockPrivate !== false && /(?:^|\/)(?:manifest|bundler-manifest)\.json$/iu.test(requestPath)) return true;
  return options.blockSourceMaps !== false && requestPath.endsWith(".map");
}

function createBlockedResponse(options: BundlerStaticAssetHandlerOptions): BundlerStaticAssetResponse {
  return {
    body: Buffer.from(""),
    headers: {
      "Cache-Control": options.mode === "development" ? "no-store" : "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
    status: 404,
  };
}

function getHeader(
  headers: BundlerStaticAssetRequest["headers"],
  name: string,
): string {
  if (!headers) return "";
  if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.get(name) || "";
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  const value = match?.[1];
  return Array.isArray(value) ? value.join(", ") : String(value || "");
}

function resolveCacheControl(mode: "development" | "production", requestPath: string): string {
  if (mode === "development") return "no-store";
  if (isHashedAsset(requestPath)) return "public, max-age=31536000, immutable";
  return "public, max-age=0, must-revalidate";
}

function isHashedAsset(requestPath: string): boolean {
  return /(?:^|[-_.])[A-Za-z0-9_-]{8,}(?=\.)/u.test(path.basename(requestPath));
}

function supportsPrecompression(requestPath: string): boolean {
  return /\.(?:css|[cm]?js)$/iu.test(requestPath);
}

function resolveContentType(requestPath: string): string {
  if (requestPath.endsWith(".css")) return "text/css; charset=utf-8";
  if (/\.(?:[cm]?js)$/iu.test(requestPath)) return "text/javascript; charset=utf-8";
  if (requestPath.endsWith(".svg")) return "image/svg+xml";
  if (requestPath.endsWith(".json")) return "application/json; charset=utf-8";
  if (requestPath.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function isInsideDir(absPath: string, dir: string): boolean {
  const relative = path.relative(path.resolve(dir), absPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function isFile(filePath: string): Promise<boolean> {
  return fs.stat(filePath).then((stats) => stats.isFile(), () => false);
}

export {
  createStaticAssetMiddleware,
  serveStaticAsset,
};
