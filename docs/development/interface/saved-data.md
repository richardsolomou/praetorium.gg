# Interface: Saved application data

## Saved application data

[`src/client/offline`](../../../src/client/offline) owns reference downloads, account snapshots, and refreshes; [`src/contracts/appSnapshot.ts`](../../../src/contracts/appSnapshot.ts) owns saved-query eligibility and limits; [Mobile](../mobile.md#saved-application-data) owns native storage. `SyncStatus` shows saved, offline, and review states with retry, export, and explicit discard.

Restoration and refresh:

- Hosted pages preserve server-rendered data through hydration; injected native reference data must not seed the hosted query client.
- Restore cached public references only into missing queries after the initial screen settles; never overwrite the saved snapshot before restoration. A failed refresh retains the last successful response, and a refreshed response never replaces a newer one.
- Refresh saved account queries only when focus or connectivity returns or the account changes, never on a timer: each refresh refetches the whole snapshot, and screens in view already poll or subscribe.
- A download whose revision the service still publishes is current (`currentReference()` in [`runtime.ts`](../../../src/client/offline/runtime.ts)): reference reads, search, datasheet filters and datasheet changes answer from it without a request until a manifest check finds another revision. Any other download is only a fallback behind the service.
- Restore the saved download and check the manifest right after the initial route paints; defer account preparation and new downloads until it has idled for ten seconds. Publish only complete saved applications, retaining the previous version on failure. Manifest checks bypass caches.
- A new download applies its reference before fetching construction data, so pages and search use it first; the held construction data stays in use until the new one is saved. Saved downloads pack construction data apart from the reference and keep each query serialized. A hosted page restores one in a worker (`referenceRestore.ts`), parses each saved query only when it is read, and prepares search in idle slices. The construction worker loads the page's packed construction data itself, and a refresh that keeps the same construction asset saves the packed copy again without decoding it; the page decodes construction data only for synchronous battle and setup work, or when the worker cannot answer offline. Keep that work off the main thread.
- Development websites do not install the service worker. Authentication, administration, and API documents keep their hosted path.

Account boundaries:

- Exclude authentication secrets, administration, and impersonated accounts from snapshots. Saved responses never authenticate requests.
- Clear screen snapshots on sign-out or account change, including in other tabs. `idb-keyval`'s atomic `update` keeps account-generation checks and writes in one transaction so a stale tab cannot restore signed-out data.
- Cross-tab account notices refresh the authoritative session, which clears private data only when identity changes. Do not cancel queries or set a temporary signed-out identity for the notice: that interrupts navigation and rebroadcasts account changes between tabs.
- Unsynced work stays partitioned by owner; sign-out directs the player to sync, export, or discard it. A failed disk cleanup is reported without interrupting sign-out or navigation.

[Architecture](../architecture.md#offline-work) owns durable local work and sync.

Run `just e2e offline-work.spec.ts offline.spec.ts app-cache.spec.ts` after changes to this flow. Cold-loading tests must start in a browser context without saved IndexedDB or service workers. Read server-rendered HTML through the request context; a controlled navigation returns the saved application instead.
