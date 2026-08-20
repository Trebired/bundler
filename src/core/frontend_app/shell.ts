import fs from "node:fs/promises";
import path from "node:path";

import type {
  BundlerFrontendAppBundlerConfig,
  BundlerFrontendAppBundlerConfigOptions,
  BundlerFrontendBuildResult,
  BundlerStaticShellFile,
  BundlerStaticShellMeta,
  BundlerStaticShellOptions,
  BundlerStaticShellResult,
  BundlerStaticShellRoute,
} from "#3c8d8166992a";
import { collectFrontendAssetLinks } from "./assets.js";
import { createFrontendAppBundlerOptions } from "./config.js";

async function buildStaticShell(
  options: BundlerStaticShellOptions,
): Promise<BundlerStaticShellResult> {
  const { client, config } = createFrontendAppBundlerOptions(options.config);
  const manifest = options.build.client?.assetManifest;
  if (!manifest) throw new Error("bundler-static-shell-client-manifest-missing");

  const files: BundlerStaticShellFile[] = [];
  for (const route of resolveShellRoutes(options)) {
    const assetLinks = collectFrontendAssetLinks({
        collect: { publicPath: options.publicPath ?? client.publicPath },
        globalEntryIds: options.build.globalClientEntries,
        globalStyleRuleKey: config.globalStyleRuleKey,
        manifest,
        pageIds: route.pageIds,
        relatedEntryMap: options.build.relatedClientEntryMap,
        renderTags: true,
    });
    const html = renderStaticShellDocument({
        body: route.body ?? options.body,
        meta: { ...options.meta, ...route.meta },
        rootId: options.rootId,
        tags: assetLinks.tags?.html || "",
    });
    const outFile = resolveShellOutFile(config, route);
    if (outFile) await writeShellFile(outFile, html);
    files.push({ assetLinks, html, outFile, pageIds: route.pageIds || [], path: route.path || "/" });
  }

  return { assetLinks: files[0]?.assetLinks, files, html: files[0]?.html || "" };
}

function renderStaticShellDocument(input: {
    body?: string;
    meta: BundlerStaticShellMeta;
    rootId?: string;
    tags: string;
}): string {
  const lang = escapeHtmlAttribute(input.meta.lang || "en");
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    renderTitle(input.meta.title),
    renderDescription(input.meta.description),
    input.tags,
  ].filter(Boolean).join("\n");
  return [
    "<!doctype html>",
    `<html lang="${lang}">`,
    "<head>",
    head,
    "</head>",
    "<body>",
    input.body ?? `<div id="${escapeHtmlAttribute(input.rootId || "root")}"></div>`,
    "</body>",
    "</html>",
  ].join("\n");
}

function resolveShellRoutes(
  options: BundlerStaticShellOptions,
): BundlerStaticShellRoute[] {
  if (options.routes?.length) {
    return options.routes.map((route) => ({
          ...route,
          outFile: route.outFile ?? routeOutFile(options, route.path || "/"),
          pageIds: route.pageIds || options.pageIds || [],
    }));
  }
  return [{
      body: options.body,
      meta: options.meta,
      outFile: options.outFile === false ? false : options.outFile || "index.html",
      pageIds: options.pageIds || [],
      path: "/",
  }];
}

function routeOutFile(
  options: BundlerStaticShellOptions,
  routePath: string,
): string | false {
  if (options.outFile === false) return false;
  return routeFileTarget(routePath);
}

function routeFileTarget(routePath: string): string {
  const pathname = new URL(routePath || "/", "http://localhost").pathname;
  const normalized = path.posix.normalize(pathname).replace(/^\/+/u, "").replace(/\/+$/u, "");
  if (!normalized || normalized === ".") return "index.html";
  if (normalized.split("/").includes("..")) throw new Error("bundler-static-shell-invalid-route-path");
  return normalized.endsWith(".html") ? normalized : path.posix.join(normalized, "index.html");
}

function resolveShellOutFile(
  config: BundlerFrontendAppBundlerConfig,
  route: BundlerStaticShellRoute,
): string {
  if (route.outFile === false) return "";
  const outFile = route.outFile || "index.html";
  return path.resolve(config.rootDir, config.clientOutDir, outFile);
}

async function writeShellFile(outFile: string, html: string): Promise<void> {
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, html);
}

function renderTitle(value: unknown): string {
  const text = String(value || "").trim();
  return text ? `<title>${escapeHtmlText(text)}</title>` : "";
}

function renderDescription(value: unknown): string {
  const text = String(value || "").trim();
  return text ? `<meta name="description" content="${escapeHtmlAttribute(text)}">` : "";
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/gu, "&quot;");
}

export {
  buildStaticShell,
  renderStaticShellDocument,
};
export type {
  BundlerFrontendAppBundlerConfigOptions,
  BundlerFrontendBuildResult,
  BundlerStaticShellFile,
  BundlerStaticShellMeta,
  BundlerStaticShellOptions,
  BundlerStaticShellResult,
  BundlerStaticShellRoute,
};
