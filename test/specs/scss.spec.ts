import path from "node:path";
import { describe, expect, test } from "bun:test";

import { bundle } from "#sof0gxa0cxhk";
import { readFile, tempDir, writeFile } from "./helpers";

function createScssConfig(root: string, environment: "browser" | "node" = "browser") {
  return {
    discover: {
      dir: "./src",
      rules: [
        {
          key: "client",
          include: ["**/*.client.ts"],
          strategy: "entry" as const,
        },
        {
          key: "scss-dependencies",
          include: ["css/**/*.scss"],
          strategy: "ignore" as const,
        },
      ],
    },
    environment,
    outDir: environment === "browser" ? "./dist-browser" : "./dist-node",
    rootDir: root,
  };
}

function writeAliasFixture(root: string, entry: string): void {
  writeFile(root, "package.json", JSON.stringify({
    name: "scss-alias-fixture",
    imports: {
      "#core-palette": "./src/css/core/_palette.scss",
      "#theme-index": "./src/css/theme/index.scss",
    },
  }, null, 2));
  writeFile(root, "src/app.client.ts", `import "./css/${entry}.scss";\n`);
  writeFile(root, "src/css/core/_palette.scss", "$brand: #336699;\n");
  writeFile(root, "src/css/theme/index.scss", '@forward "#core-palette";\n');
}

describe("SCSS hash aliases", () => {
  test("resolves @use aliases from the package imports map", async () => {
    const root = tempDir();
    writeAliasFixture(root, "site");
    writeFile(root, "src/css/site.scss", `
@use "#core-palette" as palette;

.app {
  background-image: url("#sprite");
  color: palette.$brand;
}
`);

    const result = await bundle(createScssConfig(root));
    const cssOutput = result.outputs.find((filePath) => filePath.endsWith("/dist-browser/src/app.client.css"));

    expect(cssOutput).toBeDefined();
    expect(readFile(root, path.relative(root, cssOutput!))).toContain("color: #336699");
    expect(readFile(root, path.relative(root, cssOutput!))).toContain("url(#sprite)");
  });

  test("resolves @forward aliases for browser and node builds", async () => {
    const root = tempDir();
    writeAliasFixture(root, "forwarded");
    writeFile(root, "src/css/forwarded.scss", `
@use "#theme-index" as theme;

.forwarded {
  color: theme.$brand;
}
`);

    const browserResult = await bundle(createScssConfig(root, "browser"));
    const nodeResult = await bundle(createScssConfig(root, "node"));
    const browserCss = browserResult.outputs.find((filePath) => filePath.endsWith("/dist-browser/src/app.client.css"));
    const nodeCss = nodeResult.outputs.find((filePath) => filePath.endsWith("/dist-node/src/app.client.css"));

    expect(browserCss).toBeDefined();
    expect(nodeCss).toBeDefined();
    expect(readFile(root, path.relative(root, browserCss!))).toContain("color: #336699");
    expect(readFile(root, path.relative(root, nodeCss!))).toContain("color: #336699");
  });
});
