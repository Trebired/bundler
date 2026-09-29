import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const FLAG = "__trebired_attribution__";
const RULES = { dir: "src", rules: [{ key: "app", strategy: "entry", include: ["**/*.ts"] }] };

async function buildFixture({ bundle, environment, fixture, outDir, writeFixtureFile }) {
  await writeFixtureFile(fixture, "src/one.ts", "export const one = 1;\n");
  await writeFixtureFile(fixture, "src/two.ts", "export const two = 2;\n");
  await bundle({
      discover: RULES,
      format: "esm",
      outDir,
      rootDir: fixture,
      ...(environment ? { environment } : {}),
  });
  const dir = path.join(fixture, outDir);
  const names = (await fs.readdir(dir, { recursive: true })).filter((name) => String(name).endsWith(".js"));
  return Promise.all(names.map(async(name) => fs.readFile(path.join(dir, name), "utf8")));
}

function runBanner(source, globals) {
  const calls = [];
  const scope = globals(calls);
  const fakeConsole = { info: (...args) => calls.push(["console", ...args]) };
  const banner = source.split("\n")[0];
  for (let index = 0; index < 3; index += 1) {
    new Function("globalThis", "window", "console", banner)(scope, scope, fakeConsole);
  }
  return calls;
}

async function verifyAttributionBanner(context) {
  const { bundle, tempRoot, writeFixtureFile } = context;
  const fixture = path.join(tempRoot, "attribution");

  const browser = await buildFixture({ ...context, environment: "browser", fixture, outDir: "dist-browser" });
  assert.ok(browser.length > 1, "the fixture must emit more than one output file");
  for (const output of browser) {
    assert.ok(output.includes(FLAG), "every browser output carries the attribution banner");
  }

  const node = await buildFixture({ ...context, environment: "node", fixture, outDir: "dist-node" });
  for (const output of node) {
    assert.equal(output.includes(FLAG), false, "a node build gets no attribution banner");
  }

  const plain = runBanner(browser[0], () => ({}));
  assert.equal(plain.length, 1, "the banner speaks once per document, not once per output file");
  assert.equal(plain[0][0], "console", "with no logger wired it falls back to the console");
  assert.match(plain[0][1], /^\[INFO, trebired\.attribution\] This site uses software by Trebired/u);
  assert.equal(plain[0][1].includes("—"), false, "no em dashes");
  assert.equal(/@trebired|\d+\.\d+\.\d+/u.test(plain[0][1]), false, "the line names no package and no version");
  assert.equal(plain[0].length, 2, "the line carries no metadata object");

  const wired = runBanner(browser[0], (calls) => ({
        __logger_adapter_logger__: { info: (...args) => calls.push(["logger", ...args]) },
  }));
  assert.equal(wired.length, 1);
  assert.equal(wired[0][0], "logger", "a wired logger is preferred over the console");
  assert.equal(wired[0][1], "trebired.attribution");
  assert.equal(wired[0].length, 3, "a wired logger gets the group and the message, nothing more");

  const factory = runBanner(browser[0], (calls) => ({
        loggerAdapterLogger: () => ({ info: (...args) => calls.push(["logger", ...args]) }),
  }));
  assert.equal(factory[0][0], "logger", "a logger factory is resolved the way the adapter resolves it");

  const hostile = runBanner(browser[0], () => ({
        __logger_adapter_logger__: { info: () => { throw new Error("boom"); } },
  }));
  assert.equal(hostile.length, 0, "a throwing logger must not break the page");
}

export { verifyAttributionBanner };
