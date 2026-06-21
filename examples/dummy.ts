import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { bundle } from "#sof0gxa0cxhk";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "@trebired-bundler-example-"));
const srcDir = path.join(root, "src");
const outDir = path.join(root, "dist");

fs.mkdirSync(path.join(srcDir, "css"), { recursive: true });
fs.mkdirSync(path.join(srcDir, "shared"), { recursive: true });

fs.writeFileSync(path.join(srcDir, "app.client.tsx"), `
import "./css/site.scss";

export function App() {
  return <main className="app">hello</main>;
}

console.log(App);
`);

fs.writeFileSync(path.join(srcDir, "shared", "message.ts"), `
export const message = "hello-shared";
console.log(message);
`);

fs.writeFileSync(path.join(srcDir, "css", "site.scss"), `
$tone: #3054d6;

.app {
  color: $tone;
}
`);

const result = await bundle({
  discover: {
    dir: "./src",
    rules: [
      {
        key: "client",
        include: ["**/*.client.ts", "**/*.client.tsx"],
        strategy: "entry",
      },
      {
        key: "global-style",
        include: ["css/**/*.css", "css/**/*.scss"],
        strategy: "bundle",
      },
      {
        key: "shared-script",
        include: ["shared/**/*.ts", "shared/**/*.js"],
        strategy: "bundle",
      },
    ],
  },
  rootDir: root,
  outDir,
  annotateSources: true,
  sourcemap: "external",
});

console.log(result);
