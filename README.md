# @trebired/bundler

Discover-only bundler wrapper around `esbuild` with SCSS support, watch mode, source annotations, and a runtime-friendly asset manifest.

`@trebired/bundler` now has one public entry model: discovery rules. You describe what the bundler should find, whether each matched file should stay isolated, join a grouped bundle, or be ignored, and the package handles the rest.

## Install

Runtime support: Bun 1+.

```sh
bun i @trebired/bundler
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
        include: ["**/*.client.defer.ts", "**/*.client.defer.tsx"],
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
        exclude: ["**/*.client.ts", "**/*.client.tsx", "**/*.client.defer.ts", "**/*.client.defer.tsx"],
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

## Concepts

### Colocated I18n

Enable `i18n` when feature code uses `@trebired/i18n` local translators:

```ts
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
        key: "shared-script",
        include: ["**/*.ts", "**/*.tsx"],
        exclude: ["**/*.client.ts", "**/*.client.tsx"],
        strategy: "bundle",
      },
    ],
  },
  i18n: {
    supportedLanguages: ["en", "cs"],
  },
  outDir: "./dist",
});
```

Feature code imports only the central i18n API:

```ts
import { createLocalTranslator } from "@trebired/i18n";

const t = createLocalTranslator(import.meta.url, lang);
```

Language files stay next to the feature:

```txt
some-feature/
  component.tsx
  i18n/
    en.ts
    cs.ts
```

```ts
import { defineMessages } from "@trebired/i18n";

export default defineMessages({
  description:
    "First part " +
    "second part",
  title: `Title`,
});
```

During browser, node, and neutral builds, the bundler rewrites the local translator call to a normal `createTranslator()` call with static sibling imports for the configured language files. Message-file parsing and key validation come from `@trebired/i18n/checker`, so the same static TypeScript grammar is used by the CLI and the bundler. The source tree does not need local `i18n/index.ts` files, JSON dictionaries, app-wide registries, or checked-in generated source.

Builds fail when a used colocated folder is invalid:

- a supported language file is missing
- a language file is not in `supportedLanguages`
- language keys do not match the English fallback file
- a language file does not default-export `defineMessages({ ... })`
- message values are not static strings or nested message objects

Options:

- `supportedLanguages`: exact language files expected in every used colocated folder
- `defaultLanguage`: fallback language, default `en`
- `dirName`: sibling folder name, default `i18n`
- `extensions`: language file extensions, default `[".ts"]`

When `i18n` is enabled, matching discover roots skip directories with the configured `dirName`; language modules are still statically included through the transformed callers.

### Discover Rules

Rules are ordered. First match wins.

- `entry`: keep one output entry per matched file
- `bundle`: group all matched files together, then split only when the whole group exceeds `maxBundleSize`
- `aggregate`: synthesize one internal entry module in memory from many discovered modules
- `ignore`: track the file as intentionally ignored and exclude it from outputs

Every discovered file must match exactly one rule. If a file is in scope and matches nothing, the build fails.

#### `maxBundleSize`

- only valid on `bundle` rules
- defaults to `50mb`
- accepts bytes or strings like `"512kb"`, `"50mb"`, or `"1gb"`
- splits by summed source-file size before handing grouped parts to `esbuild`
- fails the build if a single grouped file is larger than the configured limit

#### Bundle Naming

Grouped outputs always use package-owned names:

- `bundle-<stable-id>.js`
- `bundle-<stable-id>-2.js`
- `bundle-<stable-id>.css`
- `bundle-<stable-id>-2.css`

Callers do not provide custom grouped bundle names.

#### Aggregate Rules

Use `strategy: "aggregate"` when you need one generated entry module without writing any temporary source file to disk.

The first built-in aggregate kind is `module-map`. It:

- optionally imports one configured root module
- imports every matched module with namespace imports
- resolves a configured export from each matched module
- builds a map object keyed by normalized discovered path
- exports the map, a resolver function, and optionally the root module binding
- can also export a default object containing the same fields

Example:

```ts
await bundle({
  discover: {
    dir: "./src/frontend",
    rules: [
      {
        key: "ssr-pages",
        include: ["pages/**/*.tsx"],
        exclude: ["**/*.client.tsx", "**/*.client.defer.tsx", "**/*.spec.tsx", "**/*.test.tsx"],
        strategy: "aggregate",
        aggregate: {
          kind: "module-map",
          rootModule: "layouts/root_document.tsx",
          collapseIndex: true,
          exports: {
            root: "rootDocument",
            map: "pages",
            resolver: "getPageComponent",
            default: true,
          },
        },
      },
    ],
  },
  outDir: "./dist",
});
```

Path keys default to the matched module path relative to the aggregate rule root, without the file extension:

- `pages/home.tsx` -> `home`
- `pages/blog/post.tsx` -> `blog/post`
- `pages/settings/index.tsx` -> `settings` when `collapseIndex: true`

Set `requireMatchedModuleExport: true` when an aggregate rule intentionally uses a broad pattern but should only include modules that provide the configured `matchedModuleExportName`. Files without that export are skipped, not imported into the generated module. Skipped paths are reported in aggregate entry metadata and rule metadata.

The export check parses TypeScript and JavaScript source. It supports `export default ...`, `export { value as default }`, `export { default } from "./module"`, and normal named exports.

Use the SSR module-map helper to create the same rule without repeating the aggregate shape:

```ts
import { createSsrModuleMapRule } from "@trebired/bundler";

const ssrPages = createSsrModuleMapRule({
  key: "ssr-pages",
  include: ["pages/**/*.tsx"],
  rootModule: "layouts/root/document.tsx",
  rootExport: "rootDocument",
  mapExport: "pages",
  resolverExport: "getPageComponent",
  matchedModuleExportName: "default",
  requireMatchedModuleExport: true,
});
```

### Frontend App Preset

Use the frontend app preset when a project follows the common frontend/SSR shape and should not repeat discover-rule boilerplate.

Before the preset, a project typically had to assemble client rules, SSR aggregate rules, public copying, manifest reading, related-client lookups, static tag rendering, and static asset serving separately.

After the preset, the app-specific part is mostly paths, environment defines, and language policy:

```ts
import {
  buildFrontendApp,
  createStaticAssetMiddleware,
  createFrontendBundlerRuntime,
  defineFrontendBundlerConfig,
} from "@trebired/bundler";

const bundlerConfig = defineFrontendBundlerConfig({
  clientOutDir: "dist/client",
  ssrOutDir: "dist/ssr",
  supportedI18nLanguages: ["en", "cs"],
  ssr: {
    rootModule: "layouts/root/document.tsx",
    rootExport: "rootDocument",
    mapExport: "pages",
    resolverExport: "getPageComponent",
  },
});

await buildFrontendApp(bundlerConfig);

const runtime = createFrontendBundlerRuntime(bundlerConfig);
await runtime.ensure();
const page = await runtime.resolvePageComponent("account");
const rootDocument = await runtime.resolveRootDocument();
const assets = await runtime.buildAssetLinks(["account"]);

app.use("/assets", createStaticAssetMiddleware(bundlerConfig));
```

Defaults:

- `frontendDir`: `src/frontend`
- `publicDir`: `src/frontend/public`
- client entries: `*.client.ts`, `*.client.tsx`, `*.client.js`, `*.client.jsx`, `*.client.css`, `*.client.scss`
- deferred client entries: `*.client.defer.ts`, `*.client.defer.tsx`, `*.client.defer.js`, `*.client.defer.jsx`
- global client entries: `auto`, using `js/**/*.client.*` and `js/**/*.client.defer.*`
- global style bundle patterns: `css/**/*.css`, `css/**/*.scss`, component `styles.*`, and `js/**/styles.*`
- ignored sources: tests, declarations, SCSS partials, public files, and runtime-oriented source patterns
- SSR module map: rule key `ssr-pages`, page patterns under `pages`, exports `rootModule`, `modules`, and `getModule`
- SSR page filtering: only modules with a default export are included by default
- browser builds: ESM, splitting on, output layout on
- node SSR builds: ESM, splitting off, output layout on
- production client builds: minify, strip comments, and precompress JS/CSS

Use `target` when a command should build only one side:

```ts
await buildFrontendApp({ ...bundlerConfig, target: "client" });
await buildFrontendApp({ ...bundlerConfig, target: "ssr" });
await buildFrontendApp({ ...bundlerConfig, target: "all" });
```

Use `nodeModules` when SSR output needs a runtime `node_modules` directory next to the built entry:

```ts
const bundlerConfig = defineFrontendBundlerConfig({
  clientOutDir: "dist/client",
  ssrOutDir: "dist/ssr",
  nodeModules: {
    strategy: "symlink",
    sourceDir: "node_modules",
    targetDir: "dist/ssr/node_modules",
    force: true,
  },
});
```

`buildFrontendApp()` prepares it after SSR builds. `createFrontendBundlerRuntime()` also prepares it before importing SSR output and refreshes it after dev SSR rebuilds.

After `await runtime.ensure()`, synchronous render paths can use cached helpers without starting new builds or imports:

```ts
const page = runtime.resolvePageComponentSync("account");
const rootDocument = runtime.resolveRootDocumentSync();
const assets = runtime.buildAssetLinksSync(["account"]);
```

The sync helpers throw `bundler-frontend-runtime-not-ensured` until `ensure()` has completed.

The preset returns ordinary `BundlerOptions` through `createFrontendAppBundlerOptions()`, so callers can still inspect or pass the client and SSR builds to `bundle()` or `watch()` directly.

### Related Entries

Use `collectRelatedEntries()` when server-side or build orchestration code starts from one or more source modules and needs related client or style entry source paths for `collectAssetLinks()`.

```ts
import { collectAssetLinks, collectRelatedFrontendEntries } from "@trebired/bundler";

const related = await collectRelatedFrontendEntries({
  sources: ["src/pages/account.tsx"],
  rootDir: process.cwd(),
  tsconfig: true,
});

const links = collectAssetLinks(assetManifest, related.entries, {
  from: "source",
  publicPath: "/assets/",
});
```

The generic helper walks the import graph with the same relative import and tsconfig path support as `walkImportGraph()`, then checks configurable candidate patterns. The frontend wrapper uses the default `.client.*` and `.client.defer.*` patterns; pass `candidatePatterns` to replace them.

Use `buildRelatedClientEntryMap()` when a runtime starts from aggregate SSR matched sources and needs a page ID -> related client entry map:

```ts
import { buildRelatedClientEntryMap } from "@trebired/bundler";

const relatedClientEntries = await buildRelatedClientEntryMap({
  manifest: ssrManifest,
  ruleKey: "ssr-pages",
  rootDir: process.cwd(),
  pageId: {
    sourcePrefix: "src/frontend/pages",
    collapseIndex: true,
  },
  tsconfig: true,
});
```

### Output Layout

Use `outputLayout` when emitted files should be organized by type without a separate relocation step:

```ts
await bundle({
  discover: {
    dir: "./src/frontend",
    rules: createFrontendEntryRules(),
  },
  manifest: true,
  outDir: "./dist",
  outputLayout: {
    js: "js/[path][ext]",
    css: "css/[path][ext]",
    asset: "assets/[path][ext]",
    map: "maps/[path][ext]",
  },
  publicPath: "/assets/",
  sourcemap: "external",
});
```

Supported tokens are `[path]`, `[dir]`, `[name]`, and `[ext]`. `outputLayout: true` uses `js/[path][ext]`, `css/[path][ext]`, `assets/[path][ext]`, and source maps alongside their moved output. The build result exposes `outputLayout.moved`, and written manifests plus `assetManifest` use the final paths.

Common static asset extensions such as images and fonts use esbuild's `file` loader by default so CSS and JS references can emit assets. Override `loader` when a project needs a different asset treatment.

### Import Graph Walking

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

## Configuration

### Frontend Conventions

This API is meant for conventions like:

- `*.client.ts`
- `*.client.tsx`
- `*.client.js`
- `*.client.jsx`
- `*.client.css`
- `*.client.scss`
- `*.client.defer.ts`
- `*.client.defer.tsx`
- `*.client.defer.js`
- `*.client.defer.jsx`
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
- `*.client.*` and `*.client.defer.*` entries may not import JS/TS files owned by a grouped bundle rule; that fails the build because those files are treated as shared standalone bundles, not implicit app-entry dependencies

Use the frontend helper when you want those common entry patterns without hiding rules inside bundler core:

```ts
import { bundle, createFrontendEntryRules } from "@trebired/bundler";

await bundle({
  discover: {
    dir: "./src/frontend",
    rules: [
      ...createFrontendEntryRules(),
      {
        key: "shared-script",
        include: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
        exclude: ["**/*.client.*", "**/*.client.defer.*"],
        strategy: "bundle",
      },
    ],
  },
  outDir: "./dist",
});
```

The helper returns ordinary discover rules. Override `clientInclude`, `deferredInclude`, rule keys, or excludes when a project uses different conventions.

## Runtime

### Precompression

Use `precompress` to write `.br` and `.gz` files for selected outputs:

```ts
await bundle({
  discover: {
    dir: "./src/frontend",
    rules: createFrontendEntryRules(),
  },
  outDir: "./dist",
  precompress: {
    minSize: "1kb",
    brotliQuality: 11,
    gzipLevel: 9,
  },
});
```

When enabled, JS and CSS outputs are compressed by default. Use `include`, `exclude`, `formats`, and `minSize` to tune the selection. `precompressAssets()` is also exported for standalone output folders and returns the same byte and ratio stats.

### Static Assets

Use `serveStaticAsset()` for a framework-neutral static response object, or `createStaticAssetMiddleware()` for an Express-compatible middleware.

```ts
import { createStaticAssetMiddleware } from "@trebired/bundler";

app.use("/assets", createStaticAssetMiddleware({
  clientOutDir: "dist/client",
  mode: "production",
  rootDir: process.cwd(),
  extraStaticDirs: [
    { dir: "dist/vendor", mountPath: "vendor" },
  ],
}));
```

The handler:

- blocks `manifest.json`, `bundler-manifest.json`, and source map requests
- prefers `.br` over `.gz` for JS/CSS when `Accept-Encoding` allows it
- sets `Content-Encoding`, `Vary: Accept-Encoding`, and `X-Content-Type-Options: nosniff`
- sends immutable cache headers for hashed production assets
- sends `no-store` cache headers in development
- can serve `publicDir` in development and `clientOutDir` in all modes
- accepts a frontend app runtime/config object directly when paths should resolve from `rootDir`

Use `quarantineUnwritableOutputDir(dir, { logger })` before a build when a project wants to move aside an existing output directory that cannot be written.

### Manifest

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

#### Asset Manifest Shape

`result.entries` is a source ownership map:

```ts
Record<string, string>
// source path -> owning entry key
```

`assetManifest` exposes:

- `sources[sourcePath]`: source file -> owning entry key, rule key, strategy, outputs
- `entries[entryKey]`: entry or grouped bundle -> owned sources, outputs, JS, CSS, assets, plus generated/aggregate metadata when applicable
- `entryOutputs[emittedFile]`: emitted entry output -> entry key
- `outputs[outputFile]`: normalized output metadata
- `rules[ruleKey]`: grouped entry keys plus ignored sources for that rule, plus aggregate metadata when applicable

This lets runtime code resolve either:

- a source path to its owning entry key
- an entry key to the emitted scripts/styles/assets
- a grouped bundle back to the exact source files it owns

#### Collecting Runtime Links

Use `collectAssetLinks()` when app code needs scripts and styles for one or more sources or entry keys.

Supported lookup modes:

- `from: "source"`
- `from: "entryKey"`
- `from: "entryOutput"`
- `from: "ruleKey"`
- `from: "auto"` (default)

#### Manifest Runtime Helpers

Runtime code can use package helpers instead of digging through the written manifest shape:

```ts
import {
  collectAggregateMatchedSourcesByRuleKey,
  createAggregateSourceIdMap,
  extractAssetManifest,
  normalizeAggregateSourceId,
  readBundlerManifest,
  resolveAggregateEntryByRuleKey,
  resolveAssetManifestEntryOutputPath,
} from "@trebired/bundler";

const writtenManifest = await readBundlerManifest("dist/ssr/bundler-manifest.json");
const assetManifest = extractAssetManifest(writtenManifest);
const aggregateEntry = resolveAggregateEntryByRuleKey(assetManifest, "ssr-pages");
const matchedSources = collectAggregateMatchedSourcesByRuleKey(assetManifest, "ssr-pages");
const sourceIds = createAggregateSourceIdMap(matchedSources, {
  sourcePrefix: "src/frontend/pages",
  collapseIndex: true,
});
const entryFile = resolveAssetManifestEntryOutputPath({
  manifest: assetManifest,
  entryId: "ssr-pages",
  from: "ruleKey",
  outDir: "dist/ssr",
});
const pageId = normalizeAggregateSourceId("src/frontend/pages/docs/index.tsx", {
  sourcePrefix: "src/frontend/pages",
});
```

`createEmptyAssetManifest()` is also exported for callers that need a stable empty shape before a build has produced outputs.

Use `collectFrontendAssetLinks()` when runtime code wants global styles, global client entries, and page-related client entries in one call. Pass `renderTags: true`, or call `renderAssetLinkTags()` directly, to get plain `<link>` and `<script type="module">` strings.

### Watch Mode

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

## Public API

### Public Config Shape

```ts
type BundlerDiscoverRule =
  | {
      key: string;
      include: string[];
      exclude?: string[];
      strategy: "entry";
    }
  | {
      key: string;
      include: string[];
      exclude?: string[];
      strategy: "bundle";
      maxBundleSize?: number | string;
    }
  | {
      key: string;
      include: string[];
      exclude?: string[];
      strategy: "ignore";
    }
  | {
      key: string;
      include: string[];
      exclude?: string[];
      strategy: "aggregate";
      aggregate: {
        kind: "module-map";
        rootModule?: string;
        rootModuleExportName?: string;
        matchedModuleExportName?: string;
        keyFromPath?: "relative-path";
        collapseIndex?: boolean;
        allowEmpty?: boolean;
        requireMatchedModuleExport?: boolean;
        exports?: {
          root?: string;
          map: string;
          resolver: string;
          default?: boolean;
        };
      };
    };

type BundlerDiscoverOptions = {
  dir: string;
  rules: BundlerDiscoverRule[];
  ignoreDirs?: string[];
};

type BundlerI18nOptions = {
  enabled?: boolean;
  supportedLanguages?: readonly string[];
  defaultLanguage?: string;
  dirName?: string;
  extensions?: string[];
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
  loader?: Record<string, Loader>;
  outputLayout?: boolean | {
    js?: string;
    css?: string;
    asset?: string;
    map?: string | "alongside";
  };
  precompress?: boolean | {
    formats?: Array<"br" | "gzip">;
    include?: string[];
    exclude?: string[];
    minSize?: number | string;
    brotliQuality?: number;
    gzipLevel?: number;
  };
  external?: string[];
  define?: Record<string, string>;
  clean?: boolean;
  annotateSources?: boolean;
  i18n?: boolean | BundlerI18nOptions;
  manifest?: boolean | { file?: string };
  onRebuilt?: (result: BundlerBuildResult) => void | Promise<void>;
  onEntrySetChanged?: (entries: Record<string, string>) => void | Promise<void>;
  logger?: BundlerLogger;
  loggerAdapter?: BundlerLoggerAdapter;
};
```

## CLI

### Command Reference

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
