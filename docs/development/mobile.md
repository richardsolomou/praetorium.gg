# Mobile application

The Expo shell hosts the shared web interface. React Native owns safe areas, system authentication, sharing, printing, haptics, notifications, and screen wake locks. The server owns accounts, rosters, and battles. [Interface](interface.md#application-navigation) owns application navigation; [Mobile release](mobile-release.md) owns distribution and store setup.

## Run it

Start the [local web service](running-locally.md), then use its reported URL:

```sh
EXPO_PUBLIC_APP_URL="http://127.0.0.1:<reported-port>" just mobile
```

Press `i` for iOS or `a` for Android. `just mobile-ios` and `just mobile-android` build and launch the native application; their default URLs assume port 3000. Android's emulator reaches the host through `10.0.2.2`.

Expo generates disposable, gitignored `mobile/ios` and `mobile/android` projects. Keep persistent configuration in `mobile/app.json` and `mobile/app.config.js`. Native safe areas use the web panel color; the WebView and loading screens use the page background. Release builds load `https://praetorium.gg`.

## Shell boundaries

`mobile/src/package.json` marks shared mobile source as ES modules for Node-based test consumers. Keep Expo and Metro configuration in the parent CommonJS scope. Run full Playwright collection (`pnpm exec playwright test --list`) after changing shared imports; focused runs do not load every consumer.

- `mobile/src/appShellState.ts` owns launch, load, callback delivery, retry, and renderer recovery. Ordinary launch does not wait for secure storage; an authentication callback does.
- `mobile/src/navigation.ts` keeps trusted application links in the main WebView and sends supported external links to the operating system. The injected bridge and native new-window fallback cover both `_blank` and `window.open`.
- Internal links preserve path, query, and fragment on cold and warm launches. Associated-domain configuration and signed-device checks belong to [Mobile release](mobile-release.md#production-identity-checks).
- Web features require a supported `window.PraetoriumNative.bridgeVersion` and capability, as checked in `src/client/nativeBridge.ts`. Keep older installed shells usable; a bridge version alone does not imply every capability exists.
- Android Back is enabled only when history stays inside the current application section. Keep the iOS WebView back gesture disabled: its history can expose an empty document below the first route.
- `mobile/src/lifecycle.ts` reconnects and refetches through the web application's browser handlers after a real background cycle. Do not add native battle state or a separate lifecycle fetch path.

## Authentication

`mobile/src/nativeAuth.ts` validates requests and the reserved `praetorium://auth` callback. Apple, Google, Discord, and GitHub use a system authentication session. GitHub requires the `github-auth` capability.

The shell keeps a pending proof in SecureStore and submits it as a top-level WebView POST. The server binds the receipt to the shell, provider, action, destination, user, and session; it sets the cookie before redirecting. Tokens and verifiers stay in request bodies. Only the non-secret exchange ID may appear in the temporary query parameter, which the injected bridge removes.

Callback delivery waits for the remounted document, confirms the destination loaded, then consumes the receipt and removes the proof. Restart and transport failure retain retryable state; invalid or expired receipts clear it. Only the proof-bound exchange and consume endpoints accept WKWebView's missing or null `Origin`; ordinary mutations keep their origin checks.

Remounting clears `sessionStorage`; an unsaved visitor roster lives in `localStorage` and survives system-provider sign-in. Email sign-in stays in the document. Provider linking transfers the existing session through Better Auth's single-use token; failure between token consumption and callback requires restarting the link flow.

## Saved application data

[`mobile/src/offlineReferenceStorage.ts`](../../mobile/src/offlineReferenceStorage.ts) stores the public reference and application bundle; [`mobile/src/appSnapshotStorage.ts`](../../mobile/src/appSnapshotStorage.ts) stores account-scoped screen data. Keep files separate by application origin. Check replacements before discarding previous data, retain a recoverable previous generation, and ignore incomplete writes. Move verified snapshot writes to a new filename: Expo overwrite moves delete the destination before moving and can lose the prior snapshot on failure. [Interface](interface.md#saved-application-data) owns snapshot eligibility and the seamless lookup contract.

Launches load the hosted application first so a connected launch uses the current release. A failed document load opens the saved application at the requested path with background refresh. Hosted reference caching uses the same compressed public asset as the website; the native shell still receives one complete saved HTML application. Application-only updates reuse the saved reference corpus. Deep links stay in the same application. Saved and hosted WebViews both remount after renderer termination; saved recovery resumes the memory router’s latest path. Preserve the hosted authentication/receipt path, native capabilities, cookies, and ordinary mutation origin checks. The `offline-reference` and `app-snapshot` capabilities gate storage support; older shells keep their existing path.

Run `just e2e-native-offline-ios` after changing saved launch or storage. It extends the authentication journey with a cold launch while the service is unreachable, saved Home/rosters/battles, unvisited references, real renderer termination and recovery while disconnected, and foreground refresh that preserves the open rule. Also verify airplane mode and reopening on a signed physical iPhone; Android needs an available emulator or device.

Set `NATIVE_AUTH_KEEP_STACK=1` only when leaving a verified simulator preview running. Its origin and owning process are recorded in the ignored `mobile/.simulator-derived/native-auth-e2e/preview-owner.json`; stop that process to clean up its stack.

## Notifications

`expo-notifications` uses Expo delivery through APNs and FCM. The web bridge carries request IDs; permission is requested only after the player chooses to allow notifications. Home's dismissed offer stays dismissed for that installation. Signed-in document loads silently register an already-authorized token.

`registerPushDevice` keeps the ordinary mutation origin check and refuses stale or impersonated sessions. Registration transfers a token to the current account; sign-out removes it. `src/adapters/push.ts` owns bounded delivery, retries, and removal of invalid tokens. Notices run after the product write commits, never fail that write, and exclude the actor and practice opponents. Payloads contain only information the recipient may read.

Notification taps use the same trusted navigation as links, including cold launch. Foreground notices show a silent banner. Production credentials and entitlements belong to [Mobile release](mobile-release.md#one-time-store-setup).

## Check it

Run `just check`. Before pushing native-shell, dependency, or configuration changes, run the release-mode journey:

```sh
just e2e-native-auth-ios
```

It requires a booted iOS Simulator, Java 21, and Maestro. Set `NATIVE_AUTH_SIMULATOR_UDID` when several simulators are booted. The journey reserves the device and owns an isolated stack; it must not replace the interactive preview. Centre scroll targets before tapping: iOS accessibility can report a link as visible while the fixed application tabs cover it.

The journey verifies proof exchange, authenticated redirect, receipt consumption, authenticated reload without relaunch, and notification permission/token registration. Simulator tests keep pending proofs in memory because the build lacks the production keychain entitlement. They do not prove SecureStore, real provider authentication, verified links, or push delivery; use the [signed physical-device gate](mobile-release.md#physical-device-gate) for those.
