# Changelog

All notable changes to `@trebired/bundler` will be documented here.

This project follows semantic versioning once published.

## Unreleased

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
