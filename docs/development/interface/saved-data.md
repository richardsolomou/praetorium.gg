# Interface: Saved application data

## Saved application data

[`src/client/offline`](../../../src/client/offline) owns reference downloads, account snapshots, and refreshes; [`src/contracts/appSnapshot.ts`](../../../src/contracts/appSnapshot.ts) owns saved-query eligibility and limits; [Mobile](../mobile.md#saved-application-data) owns native storage. `SyncStatus` shows saved, offline, and review states with retry, export, and explicit discard.

Restoration and refresh:

- Hosted pages preserve server-rendered data through hydration; injected native reference data must not seed the hosted query client.
- Restore cached public references only into missing queries after the initial screen settles; never overwrite the saved snapshot before restoration, and a refreshed response never replaces a newer one.
- Restore the saved download and check the manifest right after the initial route paints; defer account preparation and new downloads until it has idled for ten seconds. Publish only complete saved applications, retaining the previous version on failure.
- A new download applies its reference before fetching construction data, so pages and search use it first; the held construction data stays in use until the new one is saved. Saved downloads pack construction data apart from the reference and keep each query serialized. Workers pack (`referenceDownload.ts`) and restore (`referenceRestore.ts`) them; the page parses a query when read and prepares search in idle slices. The construction worker loads the page's packed construction data itself, and a refresh that keeps the same construction asset saves the packed copy again without decoding it; the page decodes construction data only for synchronous battle and setup work, or when the worker cannot answer offline. Keep that work off the main thread.
- Authentication, administration, and API documents keep their hosted path.

Account boundaries:

- Saved responses never authenticate requests.
- Clear screen snapshots on sign-out or account change, including in other tabs.
- Cross-tab account notices refresh the authoritative session, which clears private data only when identity changes. Do not cancel queries or set a temporary signed-out identity for the notice: that interrupts navigation and rebroadcasts account changes between tabs.
- Unsynced work stays partitioned by owner; sign-out directs the player to sync, export, or discard it. A failed disk cleanup is reported without interrupting sign-out or navigation.

[Architecture](../architecture.md#offline-work) owns durable local work and sync.

Run `just e2e offline-work.spec.ts offline.spec.ts app-cache.spec.ts` after changes to this flow. Cold-loading tests must start in a browser context without saved IndexedDB or service workers. Read server-rendered HTML through the request context; a controlled navigation returns the saved application instead.
