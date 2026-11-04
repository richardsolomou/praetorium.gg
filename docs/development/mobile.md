# Mobile application

[Mobile release](mobile-release.md) owns distribution and store setup.

## Shell boundaries

- `mobile/ios` and `mobile/android` are disposable prebuild output; configure in `mobile/app.json` and `mobile/app.config.js`.
- Shared modules must run in Hermes; Node or browser support proves nothing.
- EAS links Expo modules precompiled against their own release's `expo-modules-core`, so move every `expo-*` package with `expo` to the versions that release bundles; a newer module crashes at launch. iOS delivery runs `scripts/checkExpoPrecompiledLinks.sh` before building.
- Web features check the specific capability in `src/client/nativeBridge.ts`, not `bridgeVersion`, and keep older installed shells usable.
- Do not add native battle state or a separate fetch path; refetch through the web handlers.
- On iOS, a back swipe previews the screen as it was drawn when its history entry was left, and WebKit skips entries a script added without a recent tap. Each tab keeps its own back stack: a reopened tab or a link into another tab pushes that tab's parents, and history pushed this way draws each screen from timers started during the tap only behind the `screen-cover` freeze; without it, the parents join history undrawn so they never flash past, at the cost of their swipe previews.
- Haptics come from the four feels in `src/contracts/nativeBridge.ts`, each with one job; a shell without `haptic-styles` gets only the old confirmation, for `light` and `success`. Links other than the tab bar, menus and dialogs stay silent.

## Authentication

- Tokens and verifiers stay in request bodies; only the non-secret exchange ID may appear in a query.
- Only the proof-bound exchange and consume endpoints accept a missing or null `Origin`; every other mutation keeps its origin check.
- Remounting clears `sessionStorage`; keep the visitor roster in `localStorage`.

## Saved application data

- Saved launches must preserve authentication, capabilities, cookies, and origin checks.
- The shell stores only the saved application; its download's parts stay in the web view's Cache Storage, which hosted pages and the saved application share.
- Run `just e2e-native-offline-ios` after changing saved launch or storage, and test an upgrade with a previous build's reference download intact.

## Notifications

- Request permission only after the player chooses to. Notices exclude practice opponents and carry only what the recipient may read.
- The Watch follows the last live battle the phone opened, seated or spectated, until another battle replaces it or the account signs out (`clearWatchBattle`). Objectives and reminders come only from the phone, and only for a seated viewer.
- While the phone is quiet, the Watch polls `/api/watch/battles/$token`. It is the one read outside server functions: it reuses `mayWatch` and returns counters a spectator already sees, never names, cards, or rules text. Its fields come from `watchLive`, which the phone's snapshot shares.
- Keep the Watch snapshot at `version: 1` and add only optional fields; installed watches reject any other version, and older shells strip unknown keys.

## Check it

- Before pushing native-shell, dependency, or configuration changes, run `just e2e-native-auth-ios`; set `NATIVE_AUTH_SIMULATOR_UDID` when several simulators are booted.
- Run `just e2e-native-guest-draft-ios` after changing callback delivery, WebView storage, or the visitor draft.
- Simulators do not prove SecureStore, real providers, verified links, or push delivery; use the [physical-device gate](mobile-release.md#physical-device-gate).
