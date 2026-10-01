# Contributing

Thanks for helping improve Esiana Sync.

## Before opening a change

1. Search existing issues and pull requests for related work.
2. Keep changes focused on synchronizing Esiana campaign knowledge with Foundry. System-specific document mappings should use the adapter API where practical.
3. Do not weaken campaign authorization, token handling, conflict detection, or non-destructive deletion behavior.
4. Add or update tests for behavior changes.
5. Update user or developer documentation when workflows change.

## Development workflow

Follow the setup in [Development](docs/DEVELOPMENT.md), then run:

```sh
pnpm test
pnpm typecheck
pnpm package
```

Before submitting a pull request, verify the relevant workflow in Foundry VTT 13 or 14. Describe the user-visible behavior, test coverage, and manual verification in the pull request.

Do not commit generated `dist/`, `release/`, dependency directories, credentials, API tokens, or local Foundry data.

Release publication is a maintainer task documented in [Releasing](docs/RELEASING.md).
