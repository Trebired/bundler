# Changelog

All notable changes to `@trebired/bundler` will be documented here.

This project follows semantic versioning once published.

## 4.6.3

- Updated the Code Discipline devDependency and lockfile to public `@trebired/code-discipline@^5.5.2`.
## 4.6.2

- Adopted the shared Trebired Code Discipline preset so package configs only keep repo-specific policy.
- Updated the Code Discipline devDependency and lockfile to public `@trebired/code-discipline@^5.5.1`.

## 4.6.1

- Fixed managed frontend config CSS asset manifests so virtual config styles remain addressable by rule key and their emitted font assets are exposed as SSR font preload tags.
- Added `fontPreloads` to collected/rendered frontend asset links, with preload tags rendered before stylesheets and scripts.
- Updated the package Code Discipline config to the platform-aligned rule set, including formatting, redundant path segment cleanup, removable comment checks, structural blank lines, and dry checks.
- Updated the Code Discipline devDependency and lockfile to the current public `@trebired/code-discipline@^5.3.0`.

## 4.6.0

- Added project config discovery for `.trebired/bundler/config.ts` with optional prefix normalization.
- Added public namespace helpers for class names, data attributes, and CSS variables; missing or false prefixes normalize to unprefixed output.

## 4.5.2

- Updated managed frontend config CSS integration to consume the brand-neutral `@trebired/frontend/config` helper names and neutral virtual rule keys.

## 4.5.1

- Fixed output-layout reference rewriting so public asset URLs are rewritten once, avoiding duplicated paths such as `/assets/assets/...` for bundled Fontsource files.

## 4.5.0

- Generalized frontend config style watching beyond `.trebired/frontend/config.ts`: the managed virtual entry now reports every file the frontend config module declares as a dependency as an esbuild watch input, so editing a design-tokens module the config imports retriggers config CSS compilation.
- Added `dependencies` to `PreparedFrontendConfigStyles` and consolidated config loading into `resolveFrontendConfigStyles()`, shared by the core build/watch paths and the config styles plugin.
- Kept compatibility with `@trebired/frontend` versions that do not report `dependencies`; the config file remains the watched input in that case.

## 4.4.2

- Changed frontend config CSS integration to compile config-derived SCSS in memory through a virtual bundler entry instead of writing `.trebired/frontend/generated/styles.scss` into projects.

## 4.4.1

- Refreshed package dependency ranges and lockfile state with `bun update` after adopting the `.trebired/code-discipline` structure.

## 4.4.0

- Added automatic `@trebired/frontend` config integration for browser builds: bundler discovers `.trebired/frontend/config.ts`, generates `.trebired/frontend/generated/styles.scss`, and includes it as an internal SCSS entry.
- Added config-only build support so projects can emit configured frontend CSS without a hand-authored SCSS entry.
- Added watch-session refresh for managed frontend SCSS, with config file and `.trebired/frontend` directory watch metadata from the SCSS plugin.
- Switched package export resolution for `@trebired/frontend/config` to import-condition-aware package export lookup.
- Updated Code Discipline paths and dependency metadata to the `.trebired/code-discipline` structure.

## 4.3.0

- Added SCSS package export resolution for Sass `@use`, `@forward`, and `@import` directives so packages can expose style modules through `exports` conditions such as `sass` and `style`.
- Added verification coverage for bundled SCSS importing package-owned Sass modules from `node_modules`.

## 4.2.2

- Changed colocated i18n local-translator logging to emit batched count summaries instead of one source path per transformed file.
- Updated Code Discipline configuration to the `imports` rule with dead import removal enabled.
- Updated bundler log group metadata fallback and internal package dependency ranges to the current published sibling releases.

## 4.2.1

- Standardized package metadata (author field, config-driven organization name, dropped the Node engine constraint) and migrated `.code-discipline/config.ts` to `defineCodeDisciplineConfig`.
- Normalized README structure and removed the license footer.

## 4.2.0

- Switched colocated i18n validation to the shared `@trebired/i18n/checker` parser and checker APIs so message-file grammar has one package-owned source of truth.
- Removed bundler-local message parsing while keeping bundler focused on local-translator detection, sibling folder resolution, static language imports, transform output, and watch metadata.
- Accepted static TypeScript message expressions supported by `@trebired/i18n`, including string concatenation across whitespace and comments.
- Prepared Code Discipline generated path metadata before typecheck/build scripts so fresh checkouts work with generated files ignored.

## 4.1.0

- Added frontend app build targets for `all`, `client`, and `ssr` so callers can build either side without local branching wrappers.
- Added runtime SSR `node_modules` preparation, matching the build helper's `none`, `symlink`, and `copy` strategies and refreshing after dev SSR rebuilds.
- Relaxed frontend SSR module-map config inputs so common rule keys, page patterns, exports, and default-export filtering come from package defaults.
- Added auto global client entry discovery for package-owned `js/**/*.client.*` and `js/**/*.client.defer.*` defaults, and included those entries in runtime asset links.
- Added synchronous cached frontend runtime helpers for root/page export resolution and asset links after `ensure()`.
- Made static asset handlers work cleanly with frontend runtime config paths resolved from `rootDir`.
- Expanded frontend app verification coverage for target-specific builds, runtime `node_modules`, partial SSR config defaults, auto global client entries, sync helper behavior, and relative static paths.

## 4.0.0

- Added a generic frontend app preset with default source, public, client-entry, deferred-entry, global-style, ignore, browser, node SSR, output-layout, i18n, and production precompression options.
- Added aggregate module-map export filtering with `requireMatchedModuleExport`, including skipped-source metadata for generated entries and rules.
- Added SSR module-map rule helpers for root modules, matched module maps, index collapsing, map exports, resolver exports, root exports, and optional default exports.
- Added manifest runtime helpers for reading written manifests, extracting asset manifests, resolving aggregate entries, collecting aggregate matched sources, resolving emitted entry files, and normalizing source paths to route/page IDs.
- Added related client entry map, frontend asset link collection, and link/script tag rendering helpers.
- Added a generic frontend build runner for client builds, optional SSR builds, public directory copying, precompression stats, SSR entry output resolution, and optional SSR `node_modules` symlink/copy handling.
- Added a frontend runtime helper for dev/prod manifest state, watch-backed rebuilds, cache-busted SSR ESM imports, SSR root/page export resolution, and page asset links.
- Added framework-neutral and Express-compatible static asset serving helpers with private manifest/map blocking, Brotli/gzip selection, cache headers, and development public directory serving.
- Added `quarantineUnwritableOutputDir()` and frontend app verification coverage for the 4.0 runtime/build/preset behavior.

## 3.7.0

- Added generic frontend entry helpers for `*.client.*` and `*.client.defer.*` discovery patterns without changing discover-rule behavior.
- Added `collectRelatedEntries()` and frontend-related entry collection on top of the existing import graph resolver and tsconfig path support.
- Added generic `outputLayout` support for relocating JS, CSS, assets, and source maps while keeping metafiles, manifests, asset manifests, references, and public paths aligned.
- Added default esbuild file loaders for common static asset extensions, with `loader` overrides still available to callers.
- Added generic Brotli and gzip precompression for selected output assets, plus standalone `precompressAssets()` stats.
- Added aggregate module-map, output layout, precompression, related entry, and frontend convention verification coverage.

## 3.6.1

- Added pack verification for published entrypoints and executable CLI output.
- Ensured the built `trebired-bundler` CLI file is executable after dist preparation.

## 3.6.0

- Added opt-in generic support for `@trebired/i18n` colocated local translators.
- Rewrites `createLocalTranslator(import.meta.url, lang)` to static sibling language imports during browser, node, and neutral esbuild builds.
- Added build-time validation for missing supported language files, unsupported language files, key mismatches, and invalid language default exports.
- Added configurable i18n languages, fallback language, folder name, and language-file extensions without generated registries or checked-in source artifacts.
- Added verification coverage for browser and node local translator builds, invalid colocated folders, and the existing non-i18n build path.

## 3.5.1

- Added package-owned organization metadata and derived bundler log groups from `package.json`.
- Removed the stale spec test script now that committed spec files are banned by Code Discipline.
- Updated internal package dependency ranges to the current sibling package releases.

## 3.5.0

- Added SCSS hash-alias coverage for Code Discipline alias-map shards and generated tsconfig fallback paths.
- Kept package-import SCSS alias behavior covered while adding nested `@forward "#alias"` verification.

## 3.4.3

- Removed dead test scripts and stale test commands from publish workflows and maintainer docs.

## 3.4.2

- Removed package test suites and banned committed `*.spec.ts`/`*.spec.tsx` files through Code Discipline.
- Added Code Discipline enforcement for hardcoded `trebired` strings outside package metadata.
- Migrated Code Discipline to `.code-discipline/config.ts` with alias-map sync output.
- Updated package-generated artifact ignores and internal package dependency ranges.

## 3.4.1

- Migrated the repository to Code Discipline 4.7 using `.code-discipline/config.ts`, alias-map output, and Git-backed generated-file ignores.
- Switched build output alias rewriting to read `.code-discipline/imports/*.json` instead of `package.json#imports`.

## 3.4.0

- Added package `imports` map resolution for SCSS `@use` and `@forward` hash aliases while preserving normal Sass relative imports, load paths, packages, and CSS asset URLs.
- Kept the SCSS resolver wired through the shared esbuild plugin path so browser and node-targeted builds compile aliases the same way.

## 3.1.2

- Moved package-owned bundler logging under the `trebired.bundler` group root, including build, watch, and initialization groups.

## 3.1.1

- Added `@trebired/result` as the internal bundler outcome surface for build-time backend coordination instead of maintaining package-local result shims.
- Enforced the current `@trebired/code-discipline` policy across the touched result integration and supporting spec structure while keeping the public bundler API unchanged.

## 3.1.0

- Added discover-rule `aggregate` support for internal generated entry modules without bringing back public `entries` or `virtualEntries`.
- Added the first built-in aggregate kind, `module-map`, for synthesizing one stable entry from discovered modules and an optional root module.
- Added aggregate metadata to runtime asset manifests and rule metadata so generated entries can be resolved without any temp source path.
- Added `collectAssetLinks(..., { from: "ruleKey" })` for resolving emitted assets directly from discover rule keys.
- Enforced the package `tb.code-discipline.ts` policy across source, tests, and examples, including synced import aliases and normalized `tsconfig` path metadata.
- Kept the public bundler API and runtime behavior unchanged while bringing the codebase into the current Trebired discipline layout.

## 3.0.0

- Rebuilt `@trebired/bundler` around discover-only configuration and removed public manual `entries`.
- Removed public `virtualEntries`; grouped bundle entry modules are now internal implementation detail only.
- Removed package-owned build `mode` profiles in favor of explicit `minify`, `stripComments`, `sourcemap`, and related esbuild-like flags.
- Replaced top-level discover include/exclude behavior with ordered discover `rules` using `entry`, `bundle`, and `ignore` strategies.
- Added per-rule `maxBundleSize` for grouped bundles, still defaulting to `50mb`.
- Kept grouped bundle filenames package-owned under the `bundle-...` naming scheme.
- Added source ownership metadata to build results and watch hooks so runtime code can resolve source file -> owning entry key.
- Redesigned the runtime asset manifest around `entries`, `sources`, `entryOutputs`, `outputs`, and `rules`, including grouped bundle membership and ignored-source tracking.
- Made `.client.*` and `.defer.*` entries fail when they import JS or TS files owned by grouped bundle rules.

## 2.0.0

- Changed `discover` to group discovered `.js` and `.ts` files into auto-named script bundles by default.
- Changed `discover` to group discovered `.css` and `.scss` files into auto-named style bundles by default.
- Added `discover.maxBundleSize` with a default of `50mb`, splitting grouped discovered bundles only when the full group exceeds the limit.
- Kept discovered `.jsx` and `.tsx` files as normal per-file entries.
- Made grouped discovered builds fail when one grouped source file is larger than the configured max bundle size.

## 1.6.0

- Added `buildAssetManifest()` for a runtime-friendly asset manifest keyed by logical entries and source paths.
- Added `collectAssetLinks()` for collecting emitted scripts, styles, and other assets without app-specific HTML generation.
- Added `walkImportGraph()` for generic source dependency walking with relative import and tsconfig `paths` resolution.
- Exposed `assetManifest` on `bundle()` and `watch()` build results and included the same structure in the written bundler manifest.

## 1.5.0

- Removed the `obfuscate` option and all package-owned obfuscation behavior, including hashed artifact naming, property mangling, and static class-token rewriting.
- Kept `extreme` mode as the strongest compacting profile while making its output naming and class strings stay stable and readable.
- Removed the leftover indirect esbuild `platform` key shim and now pass the normalized `environment` value directly.

## 1.4.0

- Fixed `extreme` mode class obfuscation so emitted JS, TS, JSX, and TSX class usage stays aligned with obfuscated CSS output across bound identifiers, class-bearing object props, helper aliases, template literals, and HTML fragments.
- Renamed the public esbuild target option from `platform` to `environment` in the package API and docs.

## 1.3.0

- Grouped package-owned logs under stable `bundler.*` scopes so Trebired logger output composes cleanly.
- Added duplicate entry-path pruning with warning logs when the same source file is bundled more than once.
- Fixed `extreme` mode class obfuscation for helper aliases, template literals with expressions, `setAttribute("class", ...)`, and HTML/template string assembly.

## 1.2.0

- Added `mode` with `debug`, `compact`, and `extreme` build profiles.
- Brought back `obfuscate` for hashed output names and optional esbuild property mangling.
- Added coordinated static class-name rewriting so CSS, JS, TS, JSX, and TSX use the same obfuscated class tokens.
- Made `extreme` mode enable the strongest package-owned compacting defaults.

## 1.1.0

- Made minification enabled by default for bundled JS and CSS output.
- Added `stripComments` so builds can drop preserved legal comments when source annotations are off.

## 1.0.0

- Changed inline source annotations from `@trebired/source:` to neutral `source:` comments.
- Added `virtualEntries` for in-memory generated entry modules.
- Added `deriveManifest()` for stable entry-centric asset graph derivation from esbuild metafiles.
- Added watch lifecycle hooks through `onRebuilt()` and `onEntrySetChanged()`.
- Aligned written manifest output with the same derived manifest graph used by runtime helpers.

## 0.2.0

- Added built-in entry discovery so the package can walk source directories and generate entry lists itself.
- Added source-tree watching for discovered entries, including new and removed matching files during watch mode.
- Added optional manifest writing that records resolved entries and generated outputs.
- Made `entries` optional when `discover` is configured.

## 0.1.0

- Added the `bundle()` and `watch()` APIs for fast esbuild-backed bundling.
- Added JS, TS, JSX, TSX, CSS, and SCSS support with `sass-embedded`.
- Added CLI commands for `build` and `watch` config-driven runs.
- Added inline `@trebired/source` annotation comments for bundled JS and CSS output.
- Added `@trebired/logger-adapter` logging support, publish-ready package metadata, tests, and docs.

- Standardized package metadata ordering and contributing guidance around the Trebired writing style.
