# @trebired/bundler

Fast bundler wrapper around `esbuild` with SCSS support, watch mode, and inline source path annotations.

`@trebired/bundler` is not a full custom bundler. It keeps the package-owned API small and lets `esbuild` do the heavy lifting, while adding logging aligned with other packages published by Trebired, SCSS compilation through `sass-embedded`, built-in source walking, config-driven CLI commands, virtual entry modules, derived manifest helpers, and inline source path comments in generated output.

## Install

Runtime support: Bun 1+ and Node.js 18+.

```sh
npm install @trebired/bundler
```

## What It Is For

Use this when:

- you want a bundling package that fits alongside other packages published by Trebired instead of wiring `esbuild` directly in every project
- you need one package that handles `tsx`, `jsx`, `ts`, `js`, `scss`, and `css`
- you want the package to discover entry files by walking your source tree
- you want in-memory generated entry modules without writing temp files
- you want watch mode and config-driven CLI commands without building a separate toolchain wrapper
- you want newly created matching files to join the build without external entry regeneration code
- you want a manifest describing resolved entries and generated outputs
- you want a stable helper for turning esbuild metafiles into runtime asset graphs
- you want rebuild hooks instead of scraping logger text
- you want generated bundles to optionally include inline comments that point back to the original source file path
- you want package-owned logs routed through `@trebired/logger-adapter`

## What It Does Not Do

This package does not:

- replace `esbuild`
- provide a dev server or HMR
- invent a separate package-specific module graph format
- manage HTML templates or deployment assets for you

If you want a fast bundling wrapper from the Trebired package ecosystem, use this package. If you want a fully custom bundler runtime, this package is intentionally not that.

## Quick Start

```ts
import { bundle } from "@trebired/bundler";

await bundle({
  discover: {
    dir: "./src",
    include: ["app.tsx", "theme.css"],
  },
  virtualEntries: {
    "entry-server": `
import { message } from "./src/lib/message";
export const rendered = message.toUpperCase();
`,
  },
  outDir: "./dist",
  sourcemap: "external",
  annotateSources: true,
  manifest: true,
});
```

## CLI

Create a config module:

```ts
import { defineBundlerConfig } from "@trebired/bundler";

export default defineBundlerConfig({
  discover: {
    dir: "./src/frontend",
    include: ["**/*.tsx", "**/*.scss", "**/*.css"],
  },
  outDir: "./dist",
  annotateSources: true,
  manifest: true,
});
```

Run:

```sh
trebired-bundler build --config ./bundler.config.mjs
trebired-bundler watch --config ./bundler.config.mjs
```

## Discovery And Walking

Set `discover` when you want `@trebired/bundler` to walk the source tree and build the entry list itself.

```ts
await bundle({
  discover: {
    dir: "./src/frontend",
    include: ["**/*.tsx", "global/**/*.scss"],
    exclude: ["**/*.test.tsx"],
    ignoreDirs: ["legacy"],
    namePrefix: "frontend",
  },
  outDir: "./dist",
});
```

The package:

- walks the configured directory recursively
- matches files by extension plus optional include and exclude patterns
- derives entry names from relative paths
- rebuilds the entry list during watch mode when matching files are added or removed

You can combine manual `entries` with `discover`. If both resolve the same entry name to different files, the build fails so the collision is explicit.

## Manifest

Set `manifest: true` to write `dist/bundler-manifest.json`, or pass `manifest: { file: "custom-name.json" }` to choose a different path inside `outDir`.

The manifest contains:

- resolved entries
- whether each entry came from `manual` config or `discover`
- generated output files

If you want a runtime-friendly asset graph directly in app code, call `deriveManifest()` on the returned `metafile`:

```ts
import { bundle, deriveManifest } from "@trebired/bundler";

const result = await bundle({
  entries: {
    app: "./src/app.tsx",
  },
  outDir: "./dist",
});

const manifest = deriveManifest(result.metafile!, {
  rootDir: process.cwd(),
  outDir: "./dist",
});
```

The helper returns:

- `entries`: entry output -> JS/CSS/import graph
- `chunks`: shared output -> import/CSS graph
- `allOutputs`: flat normalized output index

## Virtual Entries

Use `virtualEntries` when you want generated entry modules without writing temporary files:

```ts
await bundle({
  entries: {
    app: "./src/app.tsx",
  },
  virtualEntries: {
    "entry-server": `
import { message } from "./src/lib/message";
export const rendered = message.toUpperCase();
`,
    "global.client": `
import "./src/styles/site.scss";
console.log("global-client");
`,
  },
  outDir: "./dist",
});
```

Virtual entries are loaded as TypeScript/ESM modules and resolve relative imports from `rootDir`.

## Watch Hooks

Use watch hooks when app code needs clean lifecycle points after rebuilds:

```ts
await watch({
  discover: {
    dir: "./src/pages",
    include: ["**/*.tsx"],
  },
  outDir: "./dist",
  async onEntrySetChanged(entries) {
    console.log(entries);
  },
  async onRebuilt(result) {
    console.log(result.outputs);
  },
});
```

`onEntrySetChanged()` runs only when the resolved entry set changes. `onRebuilt()` runs after a successful rebuild result is assembled.

## Source Annotation Comments

Set `annotateSources: true` to inject preserved inline comments into bundled output.

JavaScript and TypeScript modules are annotated like this:

```js
/*! source: src/app.tsx */
```

CSS and SCSS sources are annotated like this:

```css
/*! source: src/styles/site.scss */
```

These comments are emitted with project-relative POSIX-style paths so the generated bundle still points back to the original source file that contributed that segment.

## Supported File Types

The package supports:

- `js`
- `jsx`
- `ts`
- `tsx`
- `css`
- `scss`

Plain JS, TS, JSX, TSX, and CSS are handled directly by `esbuild`. SCSS is compiled with `sass-embedded` and then passed back into the bundle pipeline as CSS.

## Logging

Package-owned logs are normalized through `@trebired/logger-adapter`, the same way other packages published by Trebired do it.

You can pass:

- a logger using the same call shape as other Trebired packages
- an event sink logger
- a common logger object
- a custom `loggerAdapter(logger, event)` for exact output control

## Public API

```ts
type BundlerOptions = {
  entries?: string[] | Record<string, string>;
  discover?: {
    dir: string;
    include?: string[];
    exclude?: string[];
    extensions?: string[];
    ignoreDirs?: string[];
    namePrefix?: string;
  } | Array<{
    dir: string;
    include?: string[];
    exclude?: string[];
    extensions?: string[];
    ignoreDirs?: string[];
    namePrefix?: string;
  }>;
  virtualEntries?: Record<string, string>;
  outDir: string;
  rootDir?: string;
  platform?: "browser" | "node" | "neutral";
  format?: "esm" | "cjs" | "iife";
  target?: string | string[];
  minify?: boolean;
  sourcemap?: boolean | "inline" | "external";
  splitting?: boolean;
  publicPath?: string;
  external?: string[];
  define?: Record<string, string>;
  clean?: boolean;
  annotateSources?: boolean;
  manifest?: boolean | {
    file?: string;
  };
  onRebuilt?: (result: BundlerBuildResult) => void | Promise<void>;
  onEntrySetChanged?: (entries: Record<string, string>) => void | Promise<void>;
  logger?: unknown;
  loggerAdapter?: (logger: unknown, event: unknown) => unknown;
};

declare function bundle(options: BundlerOptions): Promise<{
  entries: Record<string, string>;
  outputs: string[];
  warnings: number;
  metafile?: object;
  manifestPath?: string;
  durationMs: number;
}>;

declare function deriveManifest(
  metafile: object,
  options: {
    rootDir: string;
    outDir: string;
  },
): {
  entries: Record<string, unknown>;
  chunks: Record<string, unknown>;
  allOutputs: Record<string, unknown>;
};

declare function watch(options: BundlerOptions): Promise<{
  rebuild(): Promise<{
    entries: Record<string, string>;
    outputs: string[];
    warnings: number;
    metafile?: object;
    manifestPath?: string;
    durationMs: number;
  }>;
  dispose(): Promise<void>;
}>;
```
