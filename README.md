# Esiana Sync for Foundry VTT

Esiana Sync is a Foundry VTT 13–14 module that synchronizes campaign collections between [Esiana](https://github.com/Esiana-ttrpg) and Foundry. It brings selected Esiana content into an `Esiana` folder as journal entries or actors and sends edits to selected fields back to Esiana.

Esiana remains authoritative for release rules and lifecycle fields. The module preserves content that is outside the selected fields and stops on conflicting two-sided edits instead of silently overwriting either copy.

## Requirements

- Foundry VTT 13 or 14
- An Esiana deployment with the `foundry-vtt-sync` plugin installed globally and enabled for the campaign
- An Esiana API token with `campaign:read` and `campaign:write`
- A Foundry user with GM permissions

See [Installation](docs/INSTALLATION.md) for Foundry installation options.

## Connect a world

1. Enable **Esiana Sync** from **Manage Modules** in the Foundry world.
2. As a GM, open **Game Settings → Configure Settings → Module Settings**.
3. Find **Esiana Sync** and select **Configure Esiana Sync**.
4. Enter the Esiana base URL and API token.
5. Choose a campaign administered by the token.
6. Choose the collections and fields to synchronize. For characters, also choose journal or actor representation and, when using actors, an actor type.
7. Select **Save and sync**.

The Esiana URL must be reachable from the GM's browser. When Foundry and Esiana use different origins, add the Foundry browser origin to the Esiana deployment's CORS allowlist or reverse-proxy configuration.

## Settings

**Configure Esiana Sync** controls:

- **Esiana URL** — the base URL of the Esiana deployment.
- **API token** — stored as a hidden, client-scoped setting. Each GM and browser connects independently; the token is not stored in world settings or documents.
- **Campaign** — one campaign for which the token grants a gamemaster role.
- **Collections** — the Esiana collections synchronized with the world.
- **Fields** — the fields synchronized in each enabled collection. Fields marked read-only can be received from Esiana but not written back.
- **Character representation** — characters can become journal entries or actors. Actor representation also requires a Foundry actor type.

The module synchronizes every five minutes after configuration and schedules a near-immediate sync when a linked document changes. Reopen **Configure Esiana Sync** to change the connection or selection.

## Use and sync status

The module creates an `Esiana` folder and collection-specific subfolders. Create or edit documents inside those managed folders to synchronize the selected fields. Moving or renaming a document does not break its link because identity is stored in `flags.esiana-sync.sync`, not in titles or folders.

Choose **Open Sync Status** under the module settings to:

- synchronize immediately;
- inspect the last synchronization result;
- review connection errors;
- resolve conflicts; or
- reconfigure the connection.

For a conflict, choose the Esiana version, the Foundry version, or duplicate the Foundry copy before applying the Esiana version. Deleting a linked record on either side never deletes its counterpart: the surviving record is unlinked or marked as orphaned.

## Adapter API

System-specific modules can register richer actor mappings:

```js
game.modules.get('esiana-sync').api.registerAdapter(id, adapter);
```

The module also exposes `sync()`, `openSetup()`, and `openStatus()` through the same API object.

## Project documentation

- [Installation](docs/INSTALLATION.md)
- [Development](docs/DEVELOPMENT.md)
- [Contributing](CONTRIBUTING.md)
- [Releasing](docs/RELEASING.md)

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE).
