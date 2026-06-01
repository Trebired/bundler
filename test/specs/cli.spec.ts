import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

import { runCli } from "../../src/cli/run-cli";
import { createFixtureProject, exists, tempDir, writeFile } from "./helpers";

function writeConfig(root: string): void {
  const sourceUrl = pathToFileURL(path.resolve(process.cwd(), "src/index.ts")).href;

  writeFile(root, "bundler.config.mjs", `
import { defineBundlerConfig } from ${JSON.stringify(sourceUrl)};

export default defineBundlerConfig({
  annotateSources: true,
  entries: {
    app: "./src/app.tsx",
  },
  outDir: "./dist",
});
`);
}

describe("trebired-bundler CLI", () => {
  test("loads config modules for build", async () => {
    const root = tempDir();
    createFixtureProject(root);
    writeConfig(root);

    let stdout = "";
    let stderr = "";

    const result = await runCli(["build", "--config", "./bundler.config.mjs"], {
      cwd: root,
      stderr: (text) => {
        stderr += text;
      },
      stdout: (text) => {
        stdout += text;
      },
    });

    expect(result.exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("\"warnings\":0");
    expect(exists(root, "dist/app.js")).toBe(true);
  });

  test("loads config modules for watch", async () => {
    const root = tempDir();
    createFixtureProject(root);
    writeConfig(root);

    let stdout = "";
    let stderr = "";

    const result = await runCli(["watch", "--config", "./bundler.config.mjs"], {
      cwd: root,
      stderr: (text) => {
        stderr += text;
      },
      stdout: (text) => {
        stdout += text;
      },
      watchDurationMs: 50,
    });

    expect(result.exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Watching for changes.");
    expect(exists(root, "dist/app.js")).toBe(true);
  });
});
