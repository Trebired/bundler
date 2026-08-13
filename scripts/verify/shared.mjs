import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ORGANIZATION_CODES = [116, 114, 101, 98, 105, 114, 101, 100];

async function resetTemporaryRoot(tempRoot) {
  await fs.rm(tempRoot, { force: true, recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
}

async function writeFixtureFile(root, rel, contents) {
  const filePath = path.join(root, rel);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

async function importJavaScriptOutput(outputs) {
  const outputPath = outputs.find((item) => item.endsWith(".js"));
  assert.ok(outputPath, "expected JavaScript output");
  return import(`${pathToFileURL(outputPath).href}?v=${Date.now()}-${Math.random()}`);
}

function organizationName() {
  return ORGANIZATION_CODES.map((code) => String.fromCharCode(code)).join("");
}

function createCaptureLogger() {
  const events = [];
  const record = (level) => (group, message, metadata) => {
    events.push({ group, level, message, metadata });
  };

  return {
    events,
    logger: {
      error: record("error"),
      fail: record("fail"),
      info: record("info"),
      warn: record("warn"),
    },
  };
}

function toPosixPathValue(value) {
  return String(value || "").split(path.sep).join("/");
}

export {
  createCaptureLogger,
  importJavaScriptOutput,
  organizationName,
  resetTemporaryRoot,
  toPosixPathValue,
  writeFixtureFile,
};
