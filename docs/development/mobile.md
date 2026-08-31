# Mobile application

The iOS and Android application is an Expo shell around the supported `https://praetorium.gg` service. The existing React application remains the only interface, and the server remains authoritative for accounts, rosters, and battles.

## Run it

Install the repository dependencies, then start Expo:

```sh
just install
just mobile
```

Press `i` for the iOS simulator or `a` for an Android emulator. The platform-specific shortcuts are `just mobile-ios` and `just mobile-android`.

Expo generates `mobile/ios` and `mobile/android` from `mobile/app.json`; both directories are gitignored. Change the app configuration instead of editing generated native projects.

The shell always loads the production service. It preserves first-party cookies, keeps `praetorium.gg` navigation inside the app, and opens other supported links with the operating system. Apple, Google and Discord authentication leaves the WebView for a system authentication session. The local proof uses a fifteen-minute envelope around Better Auth's ten-minute provider state window. A valid callback resets the local proof to the server receipt's three-minute window.

The web application binds the receipt to the shell, provider, action, destination, user, and server session. The WebView submits the receipt as a top-level POST request. The server validates the receipt, sets the session cookie, and redirects the same WebView to the bound destination. This transaction stores the cookie before the redirect loads. A temporary query value prevents a cached signed-out document. The injected bridge removes this value before the web application starts.

The shell remounts the current trusted WebView location after receiving the callback, then submits the proof only after the new document finishes loading. The destination reports success to the shell after the redirect finishes loading. The shell then removes its local proof and consumes the server receipt. Receipt consumption reloads the destination once so the interface reads the committed session. An application or renderer restart retries the same receipt. A transport failure keeps the proof for an explicit retry. An invalid or expired receipt redirects to the sign-in page and removes the proof. The token and verifier stay in request bodies. Only the non-secret exchange ID appears in the temporary query value. WKWebView can omit the `Origin` header from these requests. The server accepts a missing or null `Origin` only on the proof-bound exchange and consume endpoints.

Linking a second provider still starts by moving the existing WebView session into the system browser with Better Auth's single-use token. The system browser normally retains the resulting cookie through the provider redirect, but a browser or application failure after consuming that token and before the provider callback requires the player to start linking again from the WebView. Do not infer successful transfer from an unrelated system-browser session.

The shell preserves the full path, query, and fragment when an internal HTTPS link starts or foregrounds the application. `mobile/app.json` declares the `praetorium.gg` associated domain and Android intent filter. Production link verification also requires `APPLE_TEAM_ID` and `ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS`. The deployment serves the resulting Apple and Android association files and returns 404 rather than publishing placeholders while either platform's release identity is absent.

After a real background cycle, the shell nudges the WebView's browser lifecycle. This closes and reconnects Centrifugo, then refetches active TanStack Query data through the web application's existing browser handlers. Do not add native battle state or lifecycle-specific fetches.

`praetorium://auth` is reserved for this handoff. Keep its request and callback validation in `mobile/src/nativeAuth.ts`. The shell publishes `window.PraetoriumNative.bridgeVersion` before the web application loads; web features must require a bridge version they understand so a deployment cannot send messages to older installed shells. Bridge version 2 adds retryable, challenge-bound authentication while the web deployment retains version 1 for installed shells that have not updated yet. Bridge version 3 keeps that protocol and adds native sharing, printing, battle haptics, and active-battle screen wake locks. Each action is accepted only when version 3 declares the matching capability.

Store builds use `mobile/eas.json`. Apple metadata lives in `mobile/store.config.json`; Google Play metadata and both stores' manual review fields are recorded in [Mobile release](mobile-release.md).

## Check it

`just check` formats, lints, type-checks, and tests the mobile source with the web application. Before a mobile change is ready, also inspect it on physical iOS and Android devices and exercise sign-in, WebSocket reconnection, external links, file selection, printing, backgrounding, and platform back navigation.
