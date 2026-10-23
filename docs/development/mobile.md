# Mobile application

The Expo shell hosts the shared web interface. React Native owns safe areas, system authentication, sharing, printing, haptics, notifications, and screen wake locks. The server authenticates accounts and accepts synchronized rosters, battles, and actions; the shared interface saves edits locally first. [Interface](interface.md#application-navigation) owns application navigation; [Mobile release](mobile-release.md) owns distribution and store setup.

## Run it

Start the [local web service](running-locally.md), then use its reported URL:

```sh
EXPO_PUBLIC_APP_URL="http://127.0.0.1:<reported-port>" just mobile
```

Press `i` for iOS or `a` for Android. `mobile/ios` and `mobile/android` are disposable prebuild output; keep persistent configuration in `mobile/app.json` and `mobile/app.config.js`.

## Shell boundaries

`mobile/src/package.json` marks shared mobile source as ES modules for Node test consumers; keep Expo and Metro configuration in the parent CommonJS scope. Run `pnpm exec playwright test --list` after changing shared imports, because focused runs do not load every consumer.

Shared modules must run in the bundled Hermes runtime; Node or browser support alone does not establish native API support.

- `mobile/src/appShellState.ts` owns launch, load, callback delivery, retry, and renderer recovery.
- `mobile/src/navigation.ts` classifies trusted application and external links. [Mobile release](mobile-release.md#production-identity-checks) owns associated-domain checks.
- Web features check `window.PraetoriumNative.bridgeVersion` and the specific capability in `src/client/nativeBridge.ts`; a bridge version does not imply every capability. Keep older installed shells usable.
- [`nativeHistory.ts`](../../src/client/features/shell/nativeHistory.ts) decides when Android Back and the iOS edge swipe may go back, and `mobile/modules/praetorium-web-swipe` gates the swipe; an ungated iOS swipe exposes an empty document below the first route. The saved application's memory router has no WebView history, so its gesture stays disabled.
- `mobile/src/lifecycle.ts` reconnects and refetches through the web application's handlers after a real background cycle. Do not add native battle state or a separate lifecycle fetch path.

## Authentication

`mobile/src/nativeAuth.ts` validates requests and the reserved `praetorium://auth` callback. Apple, Google, Discord, and GitHub use a system authentication session. Email sign-in stays in the document.

- The pending proof lives in SecureStore. The server binds the receipt to the shell, provider, action, destination, user, and session, and sets the cookie before redirecting.
- Tokens and verifiers stay in request bodies; only the non-secret exchange ID may appear in the temporary query parameter.
- An invalid receipt clears the pending proof.
- Only the proof-bound exchange and consume endpoints accept WKWebView's missing or null `Origin`; ordinary mutations keep their origin checks.
- Remounting clears `sessionStorage`, so the unsaved visitor roster lives in `localStorage`. A provider-link failure between single-use token consumption and callback requires restarting the link.

## Saved application data

[Interface](interface/saved-data.md#saved-application-data) owns snapshot eligibility, lookup, and offline preparation. The shell stores the reference and application bundle in [`offlineReferenceStorage.ts`](../../mobile/src/offlineReferenceStorage.ts), screen data in [`appSnapshotStorage.ts`](../../mobile/src/appSnapshotStorage.ts), and unsynced work in [`localStateStorage.ts`](../../mobile/src/localStateStorage.ts), each behind its capability. Shells without `local-state` keep the connected mutation path.

- Launches load the hosted application first and fall back to the saved application at the requested path. Both remount after renderer termination. The saved path must preserve the authentication/receipt path, capabilities, cookies, and origin checks.
- Keep the reference corpus compressed in saved HTML and bridge messages, and stream its decoding.
- Battle projection must skip roster-only updates and clean connected battle downloads before restoring construction sources or building catalogue indexes. Offline construction and simulation use the saved roster's exact catalogue edition.
- A sync conflict requires the player's choice and is never overwritten by retrying sync.

Run `just e2e-native-offline-ios` after changing saved launch or storage. Each Maestro flow must foreground the app without stopping it; the TypeScript journey owns cold and renderer termination. A fresh install does not cover an upgrade: test global search with a previous build's reference download intact. Verify airplane mode and reopening on a signed physical iPhone.

`NATIVE_AUTH_KEEP_STACK=1` leaves a verified simulator preview running; stop the process recorded in `mobile/.simulator-derived/native-auth-e2e/preview-owner.json` to clean up.

## Printing

After changing `mobile/src/printing.ts`, save a PDF from the real iOS print sheet against production-mode pages and inspect every page.

## Notifications

Request permission only after the player chooses to allow notifications; Home's dismissed offer stays dismissed for that installation. `src/adapters/push.ts` owns delivery. Notices exclude practice opponents and carry only what the recipient may read. [Mobile release](mobile-release.md#one-time-store-setup) owns credentials and entitlements.

## Apple Watch companion

`mobile/watch/` owns the SwiftUI interface, `mobile/plugins/withWatchCompanion.js` adds its target during prebuild, and `mobile/modules/praetorium-watch/` delivers snapshots through WatchConnectivity. The tracker publishes only the seated viewer's battle, objectives, and reminders through `watch-battle`, enabled only once a paired watch has the companion installed; losing the companion discards pending private data. Scores, CP, timing, visibility, and reminders stay with their web owners.

The companion is read-only and needs the live battle open on the iPhone. watchOS schedules delivery and wrist-down refresh, so updates are not immediate.

Run `just watch-test` and `just watch-simulator` (needs a watchOS runtime). Simulators do not prove wrist-down refresh, paired delivery, or haptics; verify those on a signed iPhone and Watch before release.

## Check it

Run `just check`. Before pushing native-shell, dependency, or configuration changes, run the release-mode journey:

```sh
just e2e-native-auth-ios
```

It needs a booted iOS Simulator, Java 21, and Maestro; set `NATIVE_AUTH_SIMULATOR_UDID` when several are booted. It reserves the device and an isolated stack and must not replace the interactive preview. Centre scroll targets before tapping: iOS accessibility can report a link visible while the fixed tabs cover it.

Simulator builds keep pending proofs in memory because they lack the keychain entitlement, so they do not prove SecureStore, real providers, verified links, or push delivery; use the [signed physical-device gate](mobile-release.md#physical-device-gate).

Run `just e2e-native-guest-draft-ios` after changing callback delivery, WebView storage, or the visitor draft.
