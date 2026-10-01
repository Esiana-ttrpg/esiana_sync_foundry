# Esiana Sync for Foundry VTT

Foundry 13–14 module for collection-driven synchronization with Esiana.

## Connect

1. Install and enable the `foundry-vtt-sync` plugin globally in Esiana, then enable it for the campaign.
2. Create an Esiana API token with `campaign:read` and `campaign:write`.
3. As a Foundry GM, open the Notes controls, choose **Esiana Sync**, and run **Reconfigure**.
4. Paste the URL and token, choose an administered campaign, collections, fields, and optional Character→Actor mapping.

When Foundry and Esiana use different origins, add the Foundry browser origin to the Esiana deployment's CORS allowlist/reverse-proxy configuration.

The token is stored in a hidden client-scoped setting, never in world settings or documents. Each GM/browser connects independently.

## Safety

- Identity is stored in `flags.esiana-sync.sync`; titles and folders are not identity.
- Two-sided edits stop as conflicts rather than overwriting either copy.
- Deletion only unlinks or marks an orphan. It never deletes the other system’s record.
- Release rules and lifecycle fields remain authoritative in Esiana.
- Rich structures not represented by selected fields remain in the last synchronization snapshot.

System-specific modules may call `game.modules.get('esiana-sync').api.registerAdapter(id, adapter)` to add richer Actor mappings.
