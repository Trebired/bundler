# @trebired/bundler

Discover-only bundler wrapper around `esbuild` with SCSS support, watch mode, source annotations, and a runtime-friendly asset manifest.

`@trebired/bundler` now has one public entry model: discovery rules. You describe what the bundler should find, whether each matched file should stay isolated, join a grouped bundle, or be ignored, and the package handles the rest.

## Install

Runtime support: Bun 1+ and Node.js 18+.

```sh
npm install @trebired/bundler
```

## Quick Start

```ts
import { bundle } from "@trebired/bundler";

await bundle({
  discover: {
    dir: "./src/frontend",
    rules: [
      {
        key: "client",
        include: ["**/*.client.ts", "**/*.client.tsx"],
        strategy: "entry",
      },
      {
        key: "defer",
        include: ["**/*.defer.ts"],
        strategy: "entry",
      },
      {
        key: "global-style",
        include: ["css/**/*.css", "css/**/*.scss"],
        strategy: "bundle",
        maxBundleSize: "50mb",
      },
      {
        key: "shared-script",
        include: ["**/*.ts", "**/*.js"],
        exclude: ["**/*.client.ts", "**/*.client.tsx", "**/*.defer.ts"],
        strategy: "bundle",
        maxBundleSize: "50mb",
      },
      {
        key: "ignored-tests",
        include: ["**/*.test.*", "**/*.spec.*"],
        strategy: "ignore",
      },
    ],
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
  outDir: "./dist",
  manifest: true,
});
```

Run:

```sh
trebired-bundler build --config ./bundler.config.mjs
trebired-bundler watch --config ./bundler.config.mjs
```

## Discover Rules

Rules are ordered. First match wins.

- `entry`: keep one output entry per matched file
- `bundle`: group all matched files together, then split only when the whole group exceeds `maxBundleSize`
- `ignore`: track the file as intentionally ignored and exclude it from outputs

Every discovered file must match exactly one rule. If a file is in scope and matches nothing, the build fails.

### `maxBundleSize`

- only valid on `bundle` rules
- defaults to `50mb`
- accepts bytes or strings like `"512kb"`, `"50mb"`, or `"1gb"`
- splits by summed source-file size before handing grouped parts to `esbuild`
- fails the build if a single grouped file is larger than the configured limit

### Bundle Naming

Grouped outputs always use package-owned names:

- `bundle-<stable-id>.js`
- `bundle-<stable-id>-2.js`
- `bundle-<stable-id>.css`
- `bundle-<stable-id>-2.css`

Callers do not provide custom grouped bundle names.

## Frontend Conventions

This API is meant for conventions like:

- `*.client.ts`
- `*.client.tsx`
- `*.defer.ts`
- global `css/**/*.css`
- global `css/**/*.scss`

Typical setup:

- client boot files use `strategy: "entry"`
- defer boot files use `strategy: "entry"`
- shared JS/TS helpers use `strategy: "bundle"`
- global CSS/SCSS uses `strategy: "bundle"`
- tests and non-runtime files use `strategy: "ignore"`

Important behavior:

- grouped `bundle` rules must stay style-only or script-only; mixing CSS/SCSS with JS/TS in one rule fails
- `*.client.*` and `*.defer.*` entries may not import JS/TS files owned by a grouped bundle rule; that fails the build because those files are treated as shared standalone bundles, not implicit app-entry dependencies

## Manifest

Set `manifest: true` to write `dist/bundler-manifest.json`, or pass `manifest: { file: "custom-name.json" }`.

The build result also exposes `assetManifest` directly.

```ts
import { buildAssetManifest, bundle, collectAssetLinks } from "@trebired/bundler";

const result = await bundle({
  discover: {
    dir: "./src/frontend",
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
    ],
  },
  outDir: "./dist",
});

const assetManifest = result.assetManifest || buildAssetManifest({
  metafile: result.metafile!,
  outDir: "./dist",
  rootDir: process.cwd(),
  resolvedDiscovery: result.resolvedDiscovery,
});

const assets = collectAssetLinks(assetManifest, [
  "src/frontend/home.client.tsx",
], {
  from: "source",
  publicPath: "/",
});
```

### Asset Manifest Shape

`result.entries` is a source ownership map:

```ts
Record<string, string>
// source path -> owning entry key
```

`assetManifest` exposes:

- `sources[sourcePath]`: source file -> owning entry key, rule key, strategy, outputs
- `entries[entryKey]`: entry or grouped bundle -> owned sources, outputs, JS, CSS, assets
- `entryOutputs[emittedFile]`: emitted entry output -> entry key
- `outputs[outputFile]`: normalized output metadata
- `rules[ruleKey]`: grouped entry keys plus ignored sources for that rule

This lets runtime code resolve either:

- a source path to its owning entry key
- an entry key to the emitted scripts/styles/assets
- a grouped bundle back to the exact source files it owns

### Collecting Runtime Links

Use `collectAssetLinks()` when app code needs scripts and styles for one or more sources or entry keys.

Supported lookup modes:

- `from: "source"`
- `from: "entryKey"`
- `from: "entryOutput"`
- `from: "auto"` (default)

## Watch Mode

`watch()` stays discover-driven.

- added or removed matching files trigger a discovery rescan
- if source ownership changes, the bundler rebuilds the esbuild context
- `onEntrySetChanged()` receives the new source ownership map
- `onRebuilt()` receives the full `BundlerBuildResult`
- invalid intermediate states still surface failures, but the watcher keeps running and recovers on the next valid filesystem change

```ts
import { watch } from "@trebired/bundler";

const session = await watch({
  discover: {
    dir: "./src/frontend",
    rules: [
      {
        key: "client",
        include: ["**/*.client.ts", "**/*.client.tsx"],
        strategy: "entry",
      },
      {
        key: "shared-script",
        include: ["shared/**/*.ts", "shared/**/*.js"],
        strategy: "bundle",
      },
    ],
  },
  outDir: "./dist",
  async onEntrySetChanged(entries) {
    console.log(entries);
  },
  async onRebuilt(result) {
    console.log(result.outputs);
  },
});

await session.dispose();
```

## Import Graph Walking

Use `walkImportGraph()` when a higher-level tool needs to inspect internal source dependencies without bundling:

```ts
import { walkImportGraph } from "@trebired/bundler";

const graph = await walkImportGraph({
  entries: "./src/app.tsx",
  rootDir: process.cwd(),
});
```

It resolves:

- relative imports
- re-exports
- string-literal dynamic imports
- tsconfig `paths`

## Public Config Shape

```ts
type BundlerDiscoverRuleStrategy = "entry" | "bundle" | "ignore";

type BundlerDiscoverRule = {
  key: string;
  include: string[];
  exclude?: string[];
  strategy: BundlerDiscoverRuleStrategy;
  maxBundleSize?: number | string;
};

type BundlerDiscoverOptions = {
  dir: string;
  rules: BundlerDiscoverRule[];
  ignoreDirs?: string[];
};

type BundlerOptions = {
  discover: BundlerDiscoverOptions | BundlerDiscoverOptions[];
  outDir: string;
  rootDir?: string;
  environment?: "browser" | "node" | "neutral";
  format?: Format;
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
  manifest?: boolean | { file?: string };
  onRebuilt?: (result: BundlerBuildResult) => void | Promise<void>;
  onEntrySetChanged?: (entries: Record<string, string>) => void | Promise<void>;
  logger?: BundlerLogger;
  loggerAdapter?: BundlerLoggerAdapter;
};
```

## Migration Notes

This release removes the old mixed entry model.

- `entries` is gone
- public `virtualEntries` is gone
- `mode` is gone
- `discover.include` / `discover.exclude` at the top level is replaced by ordered `discover.rules`
- runtime code using `entryNames` or `entrySources` should move to `assetManifest.sources` and `assetManifest.entries`

## What It Does Not Do

This package does not:

- replace `esbuild`
- provide a dev server or HMR
- invent a custom runtime module system
- auto-convert grouped shared JS/TS sources into dependency-safe page entry imports
