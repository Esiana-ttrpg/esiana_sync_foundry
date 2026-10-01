# Esiana Sync for Foundry VTT

Foundry 13–14 module for collection-driven synchronization with Esiana.

## Build and verify

Requires Node.js 26 or newer and pnpm.

```sh
pnpm install
pnpm test
pnpm package
```

`pnpm package` compiles the ES modules, copies the manifest, stylesheet, and localization assets, validates every manifest entrypoint, and creates `release/esiana-sync.zip`. The ZIP contains `module.json` at its root, as Foundry requires.

During development, `pnpm build` refreshes the installable tree in `dist/`. Browser-loaded JavaScript, CSS, and localization changes are available after rebuilding and refreshing the Foundry browser client.

## Install on a development server

Foundry's **Data directory** is the directory containing `Config`, `Data`, and `Logs`; it is not the Foundry application directory. The module must resolve to:

```text
<Foundry Data directory>/modules/esiana-sync/module.json
```

Typical default Data directories are `%LOCALAPPDATA%\FoundryVTT\Data` on Windows, `$HOME/.local/share/FoundryVTT/Data` on Linux, and `$HOME/Library/Application Support/FoundryVTT/Data` on macOS. Use the path configured in Foundry's Setup screen if it differs.

### Development link (fastest)

Build and link `dist/` directly into a local Foundry Data directory:

```sh
pnpm run dev:link -- "C:\path\to\FoundryVTT\Data"
```

On macOS or Linux the same command accepts paths such as `/home/foundry/data`. The command refuses to replace an existing directory or a link to a different location. Stop Foundry before creating the link, then restart it so Setup discovers the module. For subsequent code changes, run `pnpm build` and refresh the world in the browser; restart Foundry only when changing `module.json` or if the server does not notice rebuilt files.

For a remote server, create the equivalent server-side symlink from `<data>/modules/esiana-sync` to this repository's `dist` directory, or copy the contents of `dist/` into that module directory after each build.

### ZIP install

Run `pnpm package`, then extract `release/esiana-sync.zip` into `<Foundry Data directory>/modules/esiana-sync/`. Restart Foundry, open a world, choose **Manage Modules**, and enable **Esiana Sync**.

The manifest already points at the expected GitHub release assets:

- Manifest: `https://github.com/Esiana-ttrpg/esiana_sync_foundry/releases/latest/download/module.json`
- Download: `https://github.com/Esiana-ttrpg/esiana_sync_foundry/releases/latest/download/esiana-sync.zip`

That manifest URL becomes usable from Foundry's **Install Module** dialog after a GitHub release uploads both the root `module.json` and the generated ZIP under those exact names. A raw repository `module.json` is not a complete development installer because its `download` URL still targets a release asset. Linking or copying `dist/` is faster for local iteration.

## Publish a release

Update the matching `version` fields in `module.json` and `package.json`, merge the change, and have a maintainer push a matching `v<version>` tag, for example `v0.1.1`. The release workflow runs tests and typechecking, builds and validates the module, then creates a GitHub release containing `module.json` and `esiana-sync.zip`. It fails before publishing when either version field or the tag disagrees.

The stable manifest URL above resolves through GitHub's `releases/latest` endpoint, so no repository URL changes are needed for each release. Do not attach a ZIP with an enclosing directory: Foundry expects `module.json` at the archive root, and `pnpm package` produces that layout.

## Connect

1. Install and enable the `foundry-vtt-sync` plugin globally in Esiana, then enable it for the campaign.
2. Create an Esiana API token with `campaign:read` and `campaign:write`.
3. As a Foundry GM, open **Game Settings → Configure Settings → Module Settings**, find **Esiana Sync**, and choose **Configure Esiana Sync**.
4. Paste the Esiana base URL and token, choose an administered campaign, collections, fields, and optional Character→Actor mapping.

When Foundry and Esiana use different origins, add the Foundry browser origin to the Esiana deployment's CORS allowlist or reverse-proxy configuration. The URL must be reachable from the GM's browser, not merely from the Foundry server.

The token is stored in a hidden client-scoped setting, never in world settings or documents. Each GM/browser connects independently.

Use **Open Sync Status** in the same Esiana Sync settings section to synchronize immediately, inspect the last result, resolve conflicts, or reconfigure the connection.

## Safety

- Identity is stored in `flags.esiana-sync.sync`; titles and folders are not identity.
- Two-sided edits stop as conflicts rather than overwriting either copy.
- Deletion only unlinks or marks an orphan. It never deletes the other system's record.
- Release rules and lifecycle fields remain authoritative in Esiana.
- Rich structures not represented by selected fields remain in the last synchronization snapshot.

System-specific modules may call `game.modules.get('esiana-sync').api.registerAdapter(id, adapter)` to add richer Actor mappings.
