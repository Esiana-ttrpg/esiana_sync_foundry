# Development

## Prerequisites

- Node.js 26 or newer
- pnpm
- A local or remote Foundry VTT 13–14 server for integration testing

## Build and verify

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm package
```

`pnpm build` compiles the ES modules and refreshes the installable module tree in `dist/`. `pnpm package` builds the module, copies the manifest, stylesheet, and localization assets, validates every manifest entrypoint, and creates `release/esiana-sync.zip`. The ZIP contains `module.json` at its root, as Foundry requires.

Browser-loaded JavaScript, CSS, and localization changes become available after rebuilding and refreshing the Foundry browser client.

## Link to a development server

Build and link `dist/` into a local Foundry Data directory:

```sh
pnpm run dev:link -- "C:\path\to\FoundryVTT\Data"
```

On macOS or Linux, the same command accepts paths such as `/home/foundry/data`. The command refuses to replace an existing directory or a link to a different location.

Stop Foundry before creating the link, then restart it so Setup discovers the module. For subsequent code changes, run `pnpm build` and refresh the world in the browser. Restart Foundry when changing `module.json` or when the server does not notice rebuilt files.

For a remote server, create the equivalent server-side symlink from `<data>/modules/esiana-sync` to this repository's `dist` directory, or copy the contents of `dist/` into that module directory after each build.

Do not use the raw repository `module.json` as a complete development installer: its download URL points to a published release asset. Linking or copying `dist/` is faster for local iteration.

## Repository layout

- `src/` — module source and unit tests
- `styles/` — Foundry module styles
- `lang/` — localization resources
- `scripts/` — build, validation, packaging, version, and development-link helpers
- `dist/` — generated installable module tree
- `release/` — generated release archive

See [Contributing](../CONTRIBUTING.md) before submitting changes and [Releasing](RELEASING.md) for the maintainer release process.
