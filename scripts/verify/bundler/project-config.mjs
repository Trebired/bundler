import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const workspaceConfigDir = `.${String.fromCharCode(116, 114, 101, 98, 105, 114, 101, 100)}`;
const bundlerConfigDir = `${workspaceConfigDir}/bundler`;

async function verifyBundlerProjectConfig(context) {
  const noConfig = path.join(context.tempRoot, "bundler-project-no-config");
  await fs.mkdir(noConfig, { recursive: true });
  const missing = await context.loadBundlerProjectConfig(noConfig);
  assert.deepEqual(missing.config, { prefix: "" });
  assert.equal(missing.configPath, null);
  assert.deepEqual(missing.dependencies, []);
  assert.equal(context.createBundlerNamespace(missing.config).className("button"), "button");
  assert.equal(context.createBundlerNamespace(missing.config).cssVar("button-color"), "--button-color");
  assert.equal(context.createBundlerNamespace(missing.config).dataAttr("popover"), "data-popover");
  await assert.rejects(
    () => context.loadBundlerProjectConfig(noConfig, { defaultIfMissing: false }),
    /not found/u,
  );

  const emptyConfig = path.join(context.tempRoot, "bundler-project-empty-config");
  await context.writeFile(emptyConfig, `${bundlerConfigDir}/config.ts`, "export default {};\n");
  const empty = await context.loadBundlerProjectConfig(emptyConfig);
  assert.deepEqual(empty.config, { prefix: "" });
  assert.equal(empty.dependencies.length, 1);

  const prefixedConfig = path.join(context.tempRoot, "bundler-project-prefixed-config");
  await context.writeFile(prefixedConfig, `${bundlerConfigDir}/config.ts`, "export default { prefix: 'tbf' };\n");
  await context.writeFile(prefixedConfig, "src/nested/file.ts", "export const marker = true;\n");
  const configPath = await context.findBundlerProjectConfig(path.join(prefixedConfig, "src", "nested"));
  assert.equal(configPath, path.join(prefixedConfig, bundlerConfigDir, "config.ts"));
  const prefixed = await context.loadBundlerProjectConfig(prefixedConfig, {
    searchFrom: path.join(prefixedConfig, "src", "nested"),
  });
  const namespace = context.createBundlerNamespace(prefixed.config);
  assert.deepEqual(prefixed.config, { prefix: "tbf" });
  assert.equal(namespace.className("button"), "tbf-button");
  assert.equal(namespace.cssVar("button-color"), "--tbf-button-color");
  assert.equal(namespace.dataAttr("popover"), "data-tbf-popover");
  assert.equal(namespace.dataSelector("popover"), "[data-tbf-popover]");
  assert.equal(context.normalizeBundlerPrefix(".tbf"), "tbf");
}

export { verifyBundlerProjectConfig };
