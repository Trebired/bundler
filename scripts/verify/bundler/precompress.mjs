import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const CACHE = ["node_modules", ".cache", "@trebired", "bundler", "precompress"];

async function writeOutputs(outDir) {
  await fs.mkdir(path.join(outDir, "js"), { recursive: true });
  const script = "export const value = 1;\n".repeat(200);
  await fs.writeFile(path.join(outDir, "js", "a.js"), script);
  await fs.writeFile(path.join(outDir, "js", "b.js"), script);
  await fs.writeFile(path.join(outDir, "page.css"), ".page { color: red; }\n".repeat(100));
  return script;
}

async function cachedEntries(cacheDir) {
  return (await fs.readdir(cacheDir)).filter((entry) => !entry.endsWith(".tmp")).sort();
}

async function verifyPrecompressCache(context) {
  const root = path.join(context.tempRoot, "precompress-cache");
  const outDir = path.join(root, "dist");
  const cacheDir = path.join(root, ...CACHE);
  const script = await writeOutputs(outDir);

  const first = await context.precompressAssets({ minSize: 1, outDir, rootDir: root });
  assert.equal(first.assets.length, 6, "every eligible file gets one asset per format");
  assert.equal(zlib.brotliDecompressSync(await fs.readFile(path.join(outDir, "js", "a.js.br"))).toString(), script);
  assert.equal(zlib.gunzipSync(await fs.readFile(path.join(outDir, "js", "b.js.gz"))).toString(), script);
  const entries = await cachedEntries(cacheDir);
  assert.equal(entries.length, 4, "identical files share one cache entry per format");

  const sentinel = zlib.brotliCompressSync(Buffer.from("from the cache"));
  for (const entry of entries.filter((name) => name.endsWith("-br11"))) await fs.writeFile(path.join(cacheDir, entry), sentinel);

  const stale = path.join(cacheDir, "stale-br11");
  await fs.writeFile(stale, "old");
  const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  await fs.utimes(stale, longAgo, longAgo);

  await context.precompressAssets({ minSize: 1, outDir, rootDir: root });
  const reused = zlib.brotliDecompressSync(await fs.readFile(path.join(outDir, "js", "a.js.br"))).toString();
  assert.equal(reused, "from the cache", "a second build reuses cached bytes instead of compressing again");
  await assert.rejects(fs.stat(stale), "entries unused for thirty days are pruned");
}

export { verifyPrecompressCache };
