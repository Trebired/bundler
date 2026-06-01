# Contributing

Thanks for helping improve `@trebired/bundler`.

## Development Setup

```sh
bun install
```

The package is authored in TypeScript and published from `dist`.

## Common Commands

```sh
bun run typecheck
bun test
bun run build
```

## Pull Request Checklist

- Keep public API changes intentional and documented in `README.md`.
- Add or update tests for behavior changes.
- Run typecheck, tests, and build before opening a PR.
- Update `CHANGELOG.md` under the next version section.
- Do not commit `dist` or generated package tarballs.

## Design Principles

- Keep the public API thin over the underlying bundler engine.
- Keep JS, TS, CSS, and SCSS support predictable and easy to inspect.
- Keep source annotation output stable and project-relative.
- Keep logging aligned with sibling Trebired packages.
- Avoid extra runtime dependencies unless they remove real complexity.

## Release Process

1. Move changelog entries into a versioned section.
2. Update the package version:

   ```sh
   npm version patch
   ```

   Use `minor` or `major` instead of `patch` when appropriate.

3. Verify the package:

   ```sh
   bun run typecheck
   bun test
   bun run build
   npm pack --dry-run
   ```

4. Publish with:

   ```sh
   npm publish
   ```

`npm publish` runs `prepublishOnly`, which typechecks, tests, and builds before publishing.
