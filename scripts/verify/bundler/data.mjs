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
probe: { fetch: (context) => ({ detail: "one probe", value: { dir: context.dir, name: context.name } }) },
},
},
};
`;

const APP_RULES = { dir: "src", rules: [{ include: ["app.ts"], key: "app", strategy: "entry" }] };

function failingData() {
  const offline = () => {
    throw new Error("offline");
  };
  return {
    define: "FIXTURE_DATA",
    dir: "dist/data",
    sources: { people: { fetch: offline }, prices: { fetch: offline }, probe: { fetch: offline } },
  };
}

async function verifyBundlerData(context) {
  const root = path.join(context.tempRoot, "bundler-data");
  const configPath = `${workspaceConfigDir}/bundler/config.ts`;
  await context.writeFile(root, configPath, CONFIG_SOURCE.replace("VERSION", context.packageVersion));

  const synced = await context.syncBundlerData({ rootDir: root });
  assert.deepEqual(synced.data.people, { names: ["one"] });
  assert.deepEqual(synced.data.prices, { eur: 2 });
  assert.equal(synced.data.probe.name, "probe");
  assert.equal(synced.data.probe.dir, path.join(root, "dist/data"));
  assert.equal(synced.defineName, "FIXTURE_DATA");
  const perSource = Object.fromEntries(Object.entries(synced.data).map(([name, value]) => [`FIXTURE_DATA.${name}`, JSON.stringify(value)]));
  assert.deepEqual(synced.define, { ...perSource, FIXTURE_DATA: JSON.stringify(synced.data) });
  assert.deepEqual(Object.keys(synced.define).slice(0, 3), ["FIXTURE_DATA.people", "FIXTURE_DATA.prices", "FIXTURE_DATA.probe"]);
  assert.equal(synced.assets.length, 1);
  assert.equal(synced.assets[0].path, "people/one.txt");

  const written = JSON.parse(await fs.readFile(path.join(root, "dist/data/people.json"), "utf8"));
  assert.deepEqual(written, { names: ["one"] });

  const outDir = path.join(root, "dist/site");
  assert.equal(await context.writeDataAssets(outDir, synced.assets), 1);
  assert.equal(await fs.readFile(path.join(outDir, "people/one.txt"), "utf8"), "portrait");

  await verifyGeneratedFallback(context, root);
  await verifyMissingData(context);
  await verifyDataModules(context, root);
}

async function verifyDataModules(context, root) {
  await context.writeFile(root, "src/app.ts", 'import people from "bundler-data:people";\nexport const first = people.names[0];\n');
  await context.bundle({
      discover: APP_RULES,
      format: "esm",
      outDir: "dist/modules",
      rootDir: root,
  });
  const modulesDir = path.join(root, "dist/modules");
  const outputs = (await fs.readdir(modulesDir, { recursive: true })).filter((name) => String(name).endsWith(".js"));
  const code = (await Promise.all(outputs.map((name) => fs.readFile(path.join(modulesDir, name), "utf8")))).join("\n");
  assert.ok(code.includes('"one"'), "a bundler-data import inlines the synced source");

  const ghost = 'import ghost from "bundler-data:ghost";\nexport const value = ghost;\n';
  await context.writeFile(root, "src/app.ts", ghost);
  await assert.rejects(
    context.bundle({ discover: APP_RULES, outDir: "dist/ghost", rootDir: root }),
    /was never synced/u,
  );
  await fs.rm(path.join(root, "src"), { force: true, recursive: true });
}

async function verifyGeneratedFallback(context, root) {
  const kept = await context.syncBundlerData({ data: failingData(), rootDir: root });
  assert.deepEqual(kept.data.people, { names: ["one"] });
  assert.equal(kept.data.probe.name, "probe");
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
