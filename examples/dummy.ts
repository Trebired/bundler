import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { bundle } from "../src/index.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "@trebired-bundler-example-"));
const srcDir = path.join(root, "src");
const outDir = path.join(root, "dist");

fs.mkdirSync(path.join(srcDir, "styles"), { recursive: true });
fs.writeFileSync(path.join(srcDir, "app.tsx"), `
import "./styles/site.scss";

export function App() {
  return <main className="app">hello</main>;
}

console.log(App);
`);
fs.writeFileSync(path.join(srcDir, "styles", "site.scss"), `
$tone: #3054d6;

.app {
  color: $tone;
}
`);

const result = await bundle({
  entries: {
    app: "./src/app.tsx",
  },
  rootDir: root,
  outDir,
  annotateSources: true,
  sourcemap: "external",
});

console.log(result);
