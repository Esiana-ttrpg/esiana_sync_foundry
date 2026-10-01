# Installation

## Install from a release

In Foundry's **Install Module** dialog, enter the stable manifest URL:

```text
https://github.com/Esiana-ttrpg/esiana_sync_foundry/releases/latest/download/module.json
```

Restart Foundry if prompted, open a world, choose **Manage Modules**, and enable **Esiana Sync**.

The manifest URL works after a GitHub release has published both `module.json` and `esiana-sync.zip`. The download asset is:

```text
https://github.com/Esiana-ttrpg/esiana_sync_foundry/releases/latest/download/esiana-sync.zip
```

## Install a ZIP manually

Foundry's **Data directory** contains `Config`, `Data`, and `Logs`; it is not the Foundry application directory. Extract `esiana-sync.zip` so the manifest resolves to:

```text
<Foundry Data directory>/modules/esiana-sync/module.json
```

Typical default Data directories are:

- Windows: `%LOCALAPPDATA%\FoundryVTT\Data`
- Linux: `$HOME/.local/share/FoundryVTT/Data`
- macOS: `$HOME/Library/Application Support/FoundryVTT/Data`

Use the path configured in Foundry's Setup screen if it differs. Restart Foundry after extracting the module, then enable **Esiana Sync** from **Manage Modules** inside a world.

For a source checkout or development installation, see [Development](DEVELOPMENT.md).
