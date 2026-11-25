# Esiana for Foundry VTT

This module connects a Foundry world to an Esiana campaign. It currently supports browsing the wiki, importing supported text pages as native Journal entries, and refreshing linked entries from Esiana.

## Connect

As a Foundry GM, open Game Settings and enter the Esiana URL and a personal access token in the Esiana settings. Leave the URL empty for the hosted instance. Choose **Test Connection**, select a discovered campaign, and save the settings. The token needs `campaign:read` for wiki browsing. The wiki importer uses the standard campaign API and does not require an Esiana plugin.

The token is a client-scoped Foundry setting stored in the current browser profile, not in the world or Journal documents. Use a separate browser profile from ordinary players: anyone with access to the same browser profile can inspect its local storage. Each GM configures their own token.

## Import and refresh

Use **Import Esiana** in the Journal sidebar to search and filter the campaign page tree, preview content, and select pages. Imports may be independent or linked for refresh from Esiana. The browser identifies entries already imported from the same campaign and instance. Esiana headings are represented as Journal folders up to Foundry's supported depth.

Choose **Import Content** in native settings: all content accessible to the API user, or Party-visible content only. Each import uses one normal Journal page. **Sync Esiana** refreshes linked entries using the current choice. Automatic permissions default to Never; the initial-import and every-update options grant observer access only when the imported representation is confirmed Party-visible. A page containing restricted content stays restricted. A refresh first restricts player access, and only restores it after successfully checking the current Party projection. If a page is no longer visible to the party or the refresh fails, access remains restricted. Refresh moves shared entries to the Journal root until their folder hierarchy can be rechecked against the current Party tree. Local edits that conflict with a remote update are reported rather than overwritten.

The renderer supports basic Markdown, images and readable data fallbacks for other blocks. References to already imported Journals resolve when the API link contains the page ID. Party-visible images can be copied to Foundry storage for independent imports; linked imports retain Esiana URLs because public file storage cannot revoke an image when its visibility changes. The Journal context menu can publish text pages as a new private Esiana page. Revision-protected Foundry-to-Esiana updates currently support a single text block and require the separate core API change; structured pages and title changes are refused explicitly. Existing legacy collection links lack campaign identity and are not refreshed automatically; import the pages using the current browser. See [API compatibility](docs/API-COMPATIBILITY.md) for the write-side API limitations.

The connection test verifies campaign discovery, not a live import or every token scope. The module has not yet been validated end-to-end in a Foundry world against a running Esiana instance.
