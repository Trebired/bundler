import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  collectFrontendAssetLinks,
  createBunStaticAssetHandler,
  serveStaticAsset,
} from "../../../dist/index.js";

async function assertAssetLinksAndStatic(result, fixture) {
  const links = collectFrontendAssetLinks({
      collect: { publicPath: "/assets/" },
      globalEntryIds: result.globalClientEntries,
      globalStyleRuleKey: "global-style",
      manifest: result.client.assetManifest,
      pageIds: ["home"],
      relatedEntryMap: result.relatedClientEntryMap,
      renderTags: true,
  });
  const responses = await readStaticResponses(result, fixture, links);

  assert.ok(links.styles.some((item) => item.startsWith("/assets/css/")));
  assert.ok(links.scripts.some((item) => item.startsWith("/assets/js/")));
  assert.ok(links.entryKeys.some((key) => key.includes("src/frontend/js/global.client")));
  assert.equal(responses.script.headers["Content-Encoding"], "br");
  assert.equal(responses.script.headers.Vary, "Accept-Encoding");
  assert.equal(responses.private.status, 404);
  assert.equal(responses.sourceMap.status, 404);
  assert.equal(responses.font.headers["Content-Type"], "font/woff2");
  assert.equal(responses.font.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(responses.publicImage.headers["Content-Type"], "image/png");
  assert.equal(responses.publicText.headers["Content-Type"], "text/plain; charset=utf-8");
  assert.equal(responses.publicText.body.toString(), "User-agent: *\n");
}

async function assertBunStaticHandler(fixture) {
  const handler = createBunStaticAssetHandler({
      clientOutDir: path.join(fixture, "dist/client"),
      mode: "production",
  });
  const asset = await handler(new Request("http://localhost/robots.txt"));
  const fallback = await handler(new Request("http://localhost/app/deep", {
        headers: { accept: "text/html" },
  }));
  const missingAsset = await handler(new Request("http://localhost/missing.js"));
  const font = await readBunFontAsset(handler, fixture);

  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), "User-agent: *\n");
  assert.equal(fallback.status, 200);
  assert.ok((await fallback.text()).includes("<title>Static App</title>"));
  assert.equal(missingAsset.status, 404);
  assert.equal(font.status, 200);
  assert.equal(font.headers.get("Content-Type"), "font/woff2");
  assert.equal(font.headers.get("X-Content-Type-Options"), "nosniff");
}

async function readStaticResponses(result, fixture, links) {
  const scriptOutput = result.client.assetManifest.entries[links.entryKeys
    .find((key) => result.client.assetManifest.entries[key].js.length)].file;
  const sourceMap = Object.keys(result.client.assetManifest.outputs).find((item) => item.endsWith(".map"));
  const fontOutput = Object.keys(result.client.assetManifest.outputs).find((item) => item.endsWith(".woff2"));

  assert.ok(sourceMap, "expected a source map output");
  assert.ok(fontOutput, "expected a font output");
  return {
    font: await requireStaticResponse(fixture, `/${fontOutput}`),
    private: await requireStaticResponse(fixture, "/bundler-manifest.json"),
    publicImage: await requirePublicResponse(fixture, "/pixel.png"),
    publicText: await requirePublicResponse(fixture, "/robots.txt"),
    script: await requireStaticResponse(fixture, `/${scriptOutput}`, { "accept-encoding": "gzip, br" }),
    sourceMap: await requireStaticResponse(fixture, `/${sourceMap}`),
  };
}

async function readBunFontAsset(handler, fixture) {
  const fontPath = (await fs.readdir(path.join(fixture, "dist/client/assets")))
  .find((item) => item.endsWith(".woff2"));
  assert.ok(fontPath, "expected a font asset");
  return await handler(new Request(`http://localhost/assets/${fontPath}`));
}

async function requireStaticResponse(fixture, url, headers) {
  const response = await serveStaticAsset({ headers, url }, {
      clientOutDir: path.join(fixture, "dist/client"),
      mode: "production",
  });
  assert.ok(response, `expected static response for ${url}`);
  return response;
}

async function requirePublicResponse(fixture, url) {
  const response = await serveStaticAsset({ url }, {
      clientOutDir: "dist/client",
      mode: "development",
      publicDir: "src/frontend/public",
      rootDir: fixture,
  });
  assert.ok(response, `expected public response for ${url}`);
  return response;
}

export {
  assertAssetLinksAndStatic,
  assertBunStaticHandler,
};
