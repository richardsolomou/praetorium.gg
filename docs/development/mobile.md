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

The shell always loads the production service. It preserves first-party cookies, keeps `praetorium.gg` navigation inside the app, and opens other supported links with the operating system. Google and Discord authentication leaves the WebView for a system authentication session. The local proof remains valid for Better Auth's ten-minute provider state window, then resets to the server receipt's three-minute window when a valid callback arrives. The web application hands the resulting session back through an exchange bound to the initiating shell, provider, action, destination, user, and server session. A renderer or application restart retries the same authoritative exchange. Transport and server failures keep the encrypted proof for an explicit retry; only a terminal invalid or expired response removes it. After receiving success, the shell durably removes its proof before asking the server to consume the receipt. An interruption before that removal leaves the receipt retryable; an interruption after it can only leave an unusable receipt until its short expiry. The proof and exchange stay in request bodies rather than HTTPS URLs.

Linking a second provider still starts by moving the existing WebView session into the system browser with Better Auth's single-use token. The system browser normally retains the resulting cookie through the provider redirect, but a browser or application failure after consuming that token and before the provider callback requires the player to start linking again from the WebView. Do not infer successful transfer from an unrelated system-browser session.

The shell preserves the full path, query, and fragment when an internal HTTPS link starts or foregrounds the application. `mobile/app.json` declares the `praetorium.gg` associated domain and Android intent filter. Production link verification also requires `APPLE_TEAM_ID` and `ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS`. The deployment serves the resulting Apple and Android association files and returns 404 rather than publishing placeholders while either platform's release identity is absent.

After a real background cycle, the shell nudges the WebView's browser lifecycle. This closes and reconnects Centrifugo, then refetches active TanStack Query data through the web application's existing browser handlers. Do not add native battle state or lifecycle-specific fetches.

`praetorium://auth` is reserved for this handoff. Keep its request and callback validation in `mobile/src/nativeAuth.ts`. The shell publishes `window.PraetoriumNative.bridgeVersion` before the web application loads; web features must require a bridge version they understand so a deployment cannot send messages to older installed shells. Bridge version 2 adds retryable, challenge-bound authentication while the web deployment retains version 1 for installed shells that have not updated yet.

## Check it

`just check` formats, lints, type-checks, and tests the mobile source with the web application. Before a mobile change is ready, also inspect it on physical iOS and Android devices and exercise sign-in, WebSocket reconnection, external links, file selection, printing, backgrounding, and platform back navigation.
