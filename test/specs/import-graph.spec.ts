import { describe, expect, test } from "bun:test";

import { walkImportGraph } from "../../src/index";
import { tempDir, writeFile } from "./helpers";

describe("import graph helpers", () => {
  test("walks local imports and resolves tsconfig path aliases", async () => {
    const root = tempDir();

    writeFile(root, "tsconfig.json", `
{
  "compilerOptions": {
    "paths": {
      "#feature": ["./src/feature/index.ts"],
      "#shared/*": ["./src/shared/*"]
    }
  }
}
`);

    writeFile(root, "src/app.tsx", `
import "#feature";
import "./styles/site.css";

export { sharedValue } from "#shared/value";
`);

    writeFile(root, "src/feature/index.ts", `
import { sharedValue } from "#shared/value";

console.log(sharedValue);
`);

    writeFile(root, "src/shared/value.ts", `
export const sharedValue = "shared";
`);

    writeFile(root, "src/styles/site.css", `
.app { color: blue; }
`);

    const graph = await walkImportGraph({
      entries: "./src/app.tsx",
      rootDir: root,
    });

    expect(graph.entries).toEqual(["src/app.tsx"]);
    expect(Object.keys(graph.files)).toEqual([
      "src/app.tsx",
      "src/feature/index.ts",
      "src/shared/value.ts",
      "src/styles/site.css",
    ]);
    expect(graph.files["src/app.tsx"].imports).toEqual([
      {
        specifier: "#feature",
        kind: "import",
        external: false,
        resolved: "src/feature/index.ts",
      },
      {
        specifier: "./styles/site.css",
        kind: "import",
        external: false,
        resolved: "src/styles/site.css",
      },
      {
        specifier: "#shared/value",
        kind: "export-from",
        external: false,
        resolved: "src/shared/value.ts",
      },
    ]);
    expect(graph.files["src/feature/index.ts"].imports).toEqual([
      {
        specifier: "#shared/value",
        kind: "import",
        external: false,
        resolved: "src/shared/value.ts",
      },
    ]);
    expect(graph.files["src/styles/site.css"].imports).toEqual([]);
  });
});
