import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function tempDir(): string {
  const parent = path.join(os.tmpdir(), "@trebired-bundler");
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, "test_"));
}

function writeFile(root: string, rel: string, contents: string): string {
  const filePath = path.join(root, rel);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

function readFile(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(root: string, rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

function createFixtureProject(root: string): void {
  writeFile(root, "src/app.client.tsx", `
/* app client entry comment */
import "./css/site.scss";

export const view = <section className="app">hello-bundle</section>;

console.log("app-client");
`);

  writeFile(root, "src/feature.client.ts", `
console.log("feature-client");
`);

  writeFile(root, "src/prefetch.defer.ts", `
console.log("prefetch-defer");
`);

  writeFile(root, "src/shared/message.ts", `
// grouped message comment
export const message = "hello-bundle";
`);

  writeFile(root, "src/shared/secondary.js", `
console.log("secondary-bundle");
`);

  writeFile(root, "src/css/_tokens.scss", `
$brand: blue;
`);

  writeFile(root, "src/css/site.scss", `
/* site global stylesheet comment */
@use "./tokens" as *;

.app {
  color: $brand;
  display: flex;
}
`);

  writeFile(root, "src/css/theme.css", `
@charset "UTF-8";
/* theme stylesheet comment */

.theme {
  background: white;
}
`);
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  throw new Error("wait-timeout");
}

export { createFixtureProject, exists, readFile, tempDir, waitFor, writeFile };
