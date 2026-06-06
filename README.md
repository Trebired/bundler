# @trebired/bundler

Fast bundler wrapper around `esbuild` with SCSS support, compact build modes, watch mode, and inline source path annotations.

`@trebired/bundler` is not a full custom bundler. It keeps the package-owned API small and lets `esbuild` do the heavy lifting, while adding logging aligned with other packages published by Trebired, SCSS compilation through `sass-embedded`, built-in source walking, config-driven CLI commands, virtual entry modules, derived manifest helpers, and inline source path comments in generated output.

The default build mode is `compact`. It enables minification and comment stripping unless you turn on source annotations.

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
- you want a runtime-friendly asset manifest keyed by entry names and source paths
- you want a package-owned helper for collecting script and stylesheet links for selected entries
- you want a generic import graph walker with tsconfig path resolution for higher-level presets
- you want rebuild hooks instead of scraping logger text
- you want generated bundles to optionally include inline comments that point back to the original source file path
- you want production-lean defaults with minified output and stripped comments
- you want a stronger `extreme` mode for the most aggressive package-owned compacting defaults
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
    include: ["**/*.tsx", "**/*.js", "**/*.ts", "**/*.css", "**/*.scss"],
    exclude: ["**/*.test.tsx"],
    maxBundleSize: "50mb",
  },
  outDir: "./dist",
});
```

The package:

- walks the configured directory recursively
- matches files by extension plus optional include and exclude patterns
- groups discovered `.js` and `.ts` files into auto-named script bundles
- groups discovered `.css` and `.scss` files into auto-named style bundles
- leaves discovered `.jsx` and `.tsx` files as normal per-file entries
- rebuilds the entry list during watch mode when matching files are added or removed

- grouped bundles are auto-named like `bundle-scripts-abc123.js` and `bundle-styles-abc123-2.css`
- `maxBundleSize` defaults to `50mb`
- `maxBundleSize` accepts bytes or strings like `"50mb"` and splits bundles by summed discovered source-file size before handing each group to `esbuild`
- if one discovered grouped file is larger than `maxBundleSize`, the build fails

You can combine manual `entries` with `discover`. If both resolve the same entry name to different files, the build fails so the collision is explicit.

## Manifest

Set `manifest: true` to write `dist/bundler-manifest.json`, or pass `manifest: { file: "custom-name.json" }` to choose a different path inside `outDir`.

The manifest contains:

- resolved entries
- whether each entry came from `manual` config or `discover`
- generated output files
- a runtime-friendly `assetManifest` keyed by entry source path, with lookup maps for entry names and emitted outputs

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

If you want a manifest ready for runtime asset selection, use `buildAssetManifest()`:

```ts
import { buildAssetManifest, bundle, collectAssetLinks } from "@trebired/bundler";

const result = await bundle({
  entries: {
    app: "./src/app.tsx",
  },
  outDir: "./dist",
});

const assetManifest = result.assetManifest || buildAssetManifest({
  metafile: result.metafile!,
  outDir: "./dist",
  rootDir: process.cwd(),
  resolvedEntries: result.entries,
});

const assets = collectAssetLinks(assetManifest, ["app"], {
  publicPath: "/",
});
```

The runtime asset manifest exposes:

- `entries`: entry source path -> primary file, reachable JS, reachable CSS, and other emitted assets
- `entryNames`: logical entry name -> entry source path
- `entryOutputs`: emitted entry file -> entry source path
- `outputs`: emitted output index relative to `outDir`

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

## Import Graph Walking

Use `walkImportGraph()` when a higher-level preset needs to inspect internal source dependencies without reimplementing relative import or tsconfig-path resolution:

```ts
import { walkImportGraph } from "@trebired/bundler";

const graph = await walkImportGraph({
  entries: "./src/app.tsx",
  rootDir: process.cwd(),
});
```

The helper:

- walks static imports, re-exports, and string-literal dynamic imports
- resolves relative imports and tsconfig `paths`
- returns a root-relative file graph with resolved internal imports marked explicitly

## Optimization Defaults

`@trebired/bundler` now defaults to production-lean output through `mode: "compact"`:

- `mode` defaults to `"compact"`
- `minify` defaults to `true`
- `stripComments` defaults to `true`
- source annotations stay opt-in through `annotateSources: true`

Available modes:

- `debug`: readable output, no minification, no comment stripping by default
- `compact`: minified output with stripped preserved comments by default
- `extreme`: compact mode with the strongest package-owned compacting profile, without renaming classes or artifacts

If you want a more readable debug build:

```ts
await bundle({
  entries: {
    app: "./src/app.tsx",
  },
  mode: "debug",
  minify: false,
  outDir: "./dist",
  stripComments: false,
});
```

## Extreme Mode

Use `mode: "extreme"` when you want the package to apply its strongest built-in compacting profile:

```ts
await bundle({
  entries: {
    app: "./src/app.tsx",
  },
  mode: "extreme",
  outDir: "./dist",
});
```

This mode enables:

- minification
- stripped preserved comments
- stable entry, chunk, and asset naming

Today `extreme` intentionally keeps the same readable artifact and class names as other modes. The difference is its production-lean compacting profile, not obfuscation.

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
  mode?: "debug" | "compact" | "extreme";
  environment?: "browser" | "node" | "neutral";
  format?: "esm" | "cjs" | "iife";
  target?: string | string[];
  minify?: boolean;
  stripComments?: boolean;
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
