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
  writeFile(root, "src/app.tsx", `
/* app entry comment */
import "./styles/site.scss";
import { message } from "./lib/message";

export const view = <section className="app">{message}</section>;

console.log(message);
`);

  writeFile(root, "src/lib/message.ts", `
// message comment
export const message = "hello-bundle";
`);

  writeFile(root, "src/styles/_tokens.scss", `
$brand: blue;
`);

  writeFile(root, "src/styles/site.scss", `
/* site stylesheet comment */
@use "./tokens" as *;

.app {
  color: $brand;
  display: flex;
}
`);

  writeFile(root, "src/theme.css", `
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
