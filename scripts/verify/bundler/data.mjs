import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const workspaceConfigDir = `.${String.fromCharCode(116, 114, 101, 98, 105, 114, 101, 100)}`;

const CONFIG_SOURCE = `export default {
forVersion: "VERSION",
data: {
define: "FIXTURE_DATA",
dir: "dist/data",
sources: {
people: {
fetch: async () => ({
assets: [{ contents: "portrait", path: "people/one.txt" }],
value: { names: ["one"] },
}),
},
prices: { fetch: () => ({ eur: 2 }) },
},
},
};
`;

function failingData() {
  const offline = () => {
    throw new Error("offline");
  };
  return {
    define: "FIXTURE_DATA",
    dir: "dist/data",
    sources: { people: { fetch: offline }, prices: { fetch: offline } },
  };
}

async function verifyBundlerData(context) {
  const root = path.join(context.tempRoot, "bundler-data");
  const configPath = `${workspaceConfigDir}/bundler/config.ts`;
  await context.writeFile(root, configPath, CONFIG_SOURCE.replace("VERSION", context.packageVersion));

  const synced = await context.syncBundlerData({ rootDir: root });
  assert.deepEqual(synced.data, { people: { names: ["one"] }, prices: { eur: 2 } });
  assert.equal(synced.defineName, "FIXTURE_DATA");
  assert.deepEqual(synced.define, { FIXTURE_DATA: JSON.stringify(synced.data) });
  assert.equal(synced.assets.length, 1);
  assert.equal(synced.assets[0].path, "people/one.txt");

  const written = JSON.parse(await fs.readFile(path.join(root, "dist/data/people.json"), "utf8"));
  assert.deepEqual(written, { names: ["one"] });

  const outDir = path.join(root, "dist/site");
  assert.equal(await context.writeDataAssets(outDir, synced.assets), 1);
  assert.equal(await fs.readFile(path.join(outDir, "people/one.txt"), "utf8"), "portrait");

  await verifyGeneratedFallback(context, root);
  await verifyMissingData(context);
}

async function verifyGeneratedFallback(context, root) {
  const kept = await context.syncBundlerData({ data: failingData(), rootDir: root });
  assert.deepEqual(kept.data, { people: { names: ["one"] }, prices: { eur: 2 } });
  assert.deepEqual(kept.assets, []);
}

async function verifyMissingData(context) {
  const bare = path.join(context.tempRoot, "bundler-data-none");
  await fs.mkdir(bare, { recursive: true });
  const empty = await context.syncBundlerData({ rootDir: bare });
  assert.deepEqual(empty.data, {});
  assert.deepEqual(empty.define, { BUNDLER_DATA: "{}" });
}

export { verifyBundlerData };
