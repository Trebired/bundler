# @trebired/bundler

Fast bundler wrapper around `esbuild` with SCSS support, watch mode, and inline source path annotations.

`@trebired/bundler` is not a full custom bundler. It keeps the package-owned API small and lets `esbuild` do the heavy lifting, while adding logging aligned with other packages published by Trebired, SCSS compilation through `sass-embedded`, config-driven CLI commands, and optional inline source path comments in generated output.

## Install

Runtime support: Bun 1+ and Node.js 18+.

```sh
npm install @trebired/bundler
```

## What It Is For

Use this when:

- you want a bundling package that fits alongside other packages published by Trebired instead of wiring `esbuild` directly in every project
- you need one package that handles `tsx`, `jsx`, `ts`, `js`, `scss`, and `css`
- you want watch mode and config-driven CLI commands without building a separate toolchain wrapper
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
  entries: {
    app: "./src/app.tsx",
    theme: "./src/theme.css",
  },
  outDir: "./dist",
  sourcemap: "external",
  annotateSources: true,
});
```

## CLI

Create a config module:

```ts
import { defineBundlerConfig } from "@trebired/bundler";

export default defineBundlerConfig({
  entries: {
    app: "./src/app.tsx",
  },
  outDir: "./dist",
  annotateSources: true,
});
```

Run:

```sh
trebired-bundler build --config ./bundler.config.mjs
trebired-bundler watch --config ./bundler.config.mjs
```

## Source Annotation Comments

Set `annotateSources: true` to inject preserved inline comments into bundled output.

JavaScript and TypeScript modules are annotated like this:

```js
/*! @trebired/source: src/app.tsx */
```

CSS and SCSS sources are annotated like this:

```css
/*! @trebired/source: src/styles/site.scss */
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
  entries: string[] | Record<string, string>;
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
  logger?: unknown;
  loggerAdapter?: (logger: unknown, event: unknown) => unknown;
};

declare function bundle(options: BundlerOptions): Promise<{
  outputs: string[];
  warnings: number;
  metafile?: object;
  durationMs: number;
}>;

declare function watch(options: BundlerOptions): Promise<{
  rebuild(): Promise<{
    outputs: string[];
    warnings: number;
    metafile?: object;
    durationMs: number;
  }>;
  dispose(): Promise<void>;
}>;
```
