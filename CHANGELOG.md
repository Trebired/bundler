# Changelog

All notable changes to `@trebired/bundler` will be documented here.

This project follows semantic versioning once published.

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
