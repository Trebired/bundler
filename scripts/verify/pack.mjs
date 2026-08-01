import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = path.join(rootDir, ".tmp", "verify-pack");

async function main() {
  await resetTempRoot();
  const tarballPath = packPackage();
  try {
    const packageJson = readPackedPackageJson(tarballPath);
    const tarballEntries = listTarEntries(tarballPath);
    validatePackedEntrypoints(packageJson, tarballEntries);
    await validatePackedBins(packageJson, tarballPath, tarballEntries);
    validatePackedImports(packageJson, tarballEntries);
  }
  finally {
    await fs.rm(tarballPath, { force: true });
  }
  console.log("Pack verification succeeded.");
}

async function resetTempRoot() {
  await fs.rm(tempRoot, { force: true, recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
}

function packPackage() {
  const stdout = execFileSync("bun", ["pm", "pack", "--quiet", "--destination", tempRoot], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return resolvePackedTarballPath(stdout);
}

function validatePackedEntrypoints(packageJson, tarballEntries) {
  const targets = new Set([packageJson.main, packageJson.types]);
  for (const value of Object.values(packageJson.exports || {})) collectExportTargets(value, targets);
  for (const target of targets) {
    if (typeof target !== "string") continue;
    assertTarEntryExists(tarballEntries, target, `Missing packed entrypoint target: ${target}`);
    assert.equal(target.includes("./src/"), false, `Packed entrypoint targets source: ${target}`);
  }
}

async function validatePackedBins(packageJson, tarballPath, tarballEntries) {
  for (const target of Object.values(packageJson.bin || {})) {
    if (typeof target !== "string") continue;
    assertTarEntryExists(tarballEntries, target, `Missing packed bin target: ${target}`);
    const localPath = path.join(rootDir, target.replace(/^\.\//u, ""));
    const localStats = await fs.stat(localPath);
    assert.notEqual(localStats.mode & 0o111, 0, `Built bin is not executable: ${target}`);
    assertTarEntryExecutable(tarballPath, target);
  }
}

function validatePackedImports(packageJson, tarballEntries) {
  for (const [alias, target] of Object.entries(packageJson.imports || {})) {
    if (typeof target !== "string") continue;
    assert.equal(target.includes("./src/"), false, `Packed imports entry ${alias} still points at ${target}.`);
    assertTarEntryExists(tarballEntries, target, `Packed imports target is missing for ${alias}: ${target}`);
  }
}

function collectExportTargets(value, targets) {
  if (typeof value === "string") {
    targets.add(value);
    return;
  }
  for (const nested of Object.values(value || {})) collectExportTargets(nested, targets);
}

function assertTarEntryExists(tarballEntries, packagePath, message) {
  const entryPath = `package/${String(packagePath).replace(/^\.\//u, "")}`;
  assert.equal(tarballEntries.has(entryPath), true, message);
}

function assertTarEntryExecutable(tarballPath, packagePath) {
  const entryPath = `package/${String(packagePath).replace(/^\.\//u, "")}`;
  const listing = execFileSync("tar", ["-tvf", tarballPath, entryPath], { encoding: "utf8" });
  const mode = listing.trim().split(/\s+/u)[0] || "";
  assert.equal(mode.includes("x"), true, `Packed bin is not executable: ${packagePath}`);
}

function listTarEntries(tarballPath) {
  return new Set(execFileSync("tar", ["-tf", tarballPath], {
    encoding: "utf8",
  }).split("\n").map((entry) => entry.trim()).filter(Boolean));
}

function readPackedPackageJson(tarballPath) {
  return JSON.parse(execFileSync("tar", ["-xOf", tarballPath, "package/package.json"], {
    encoding: "utf8",
  }));
}

function resolvePackedTarballPath(stdout) {
  const printed = String(stdout || "").trim().split(/\r?\n/u).pop() || "";
  const candidates = [
    path.resolve(rootDir, printed),
    path.resolve(tempRoot, printed),
  ];
  const resolved = candidates.find((candidate) => existsSync(candidate)) ?? findPackedTarball();
  if (!resolved) throw new Error("bun pm pack did not return a tarball filename.");
  return resolved;
}

function findPackedTarball() {
  return readdirSync(tempRoot)
    .filter((entry) => entry.endsWith(".tgz"))
    .map((entry) => path.join(tempRoot, entry))
    .sort()
    .at(0);
}

await main();
