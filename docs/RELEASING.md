# Releasing

Releases are published by maintainers through the GitHub release workflow.

1. Update the matching `version` fields in `module.json` and `package.json`.
2. Run `pnpm test`, `pnpm typecheck`, and `pnpm package`.
3. Merge the version change.
4. Push a matching `v<version>` tag, such as `v0.1.1`.

The release workflow verifies that both version fields agree with the tag, builds and validates the module, and creates a GitHub release containing:

- `module.json`
- `esiana-sync.zip`

The stable manifest URL uses GitHub's `releases/latest` endpoint, so it does not change between releases. Do not attach a ZIP with an enclosing directory: Foundry requires `module.json` at the archive root, and `pnpm package` produces the correct layout.
