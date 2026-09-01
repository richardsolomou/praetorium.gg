# Mobile application

The iOS and Android application is an Expo shell around the supported `https://praetorium.gg` service. The existing React application remains the only interface, and the server remains authoritative for accounts, rosters, and battles.

## Run it

Install the repository dependencies, then start Expo:

```sh
just install
just mobile
```

Press `i` for the iOS simulator or `a` for an Android emulator. The platform-specific shortcuts are `just mobile-ios` and `just mobile-android`.

Expo generates `mobile/ios` and `mobile/android` from `mobile/app.json`; both directories are gitignored and disposable. Persistent native configuration lives in the app configuration rather than those generated projects.

The shell always loads the production service. It preserves first-party cookies, keeps ordinary `praetorium.gg` navigation in the main WebView, and opens other supported links with the operating system. Its injected bridge captures both `_blank` links and `window.open`. A trusted `praetorium.gg` new window opens in a second, dismissible WebView so the original screen and authenticated session remain in place; an external URL still goes to the operating system. The WebView's native new-window event is the fallback. Apple, Google and Discord authentication leaves the WebView for a system authentication session. The local proof uses a fifteen-minute envelope around Better Auth's ten-minute provider state window. A valid callback resets the local proof to the server receipt's three-minute window.

The web application binds the receipt to the shell, provider, action, destination, user, and server session. The WebView submits the receipt as a top-level POST request. The server validates the receipt, sets the session cookie, and redirects the same WebView to the bound destination. This transaction stores the cookie before the redirect loads. A temporary query value prevents a cached signed-out document. The injected bridge removes this value before the web application starts.

The shell remounts the current trusted WebView location after receiving the callback, then submits the proof only after the new document finishes loading. The destination reports success to the shell after the redirect finishes loading. The shell then removes its local proof and consumes the server receipt. Receipt consumption reloads the destination once so the interface reads the committed session. An application or renderer restart retries the same receipt. A transport failure keeps the proof for an explicit retry. An invalid or expired receipt redirects to the sign-in page and removes the proof. The token and verifier stay in request bodies. Only the non-secret exchange ID appears in the temporary query value. WKWebView can omit the `Origin` header from these requests. The server accepts a missing or null `Origin` only on the proof-bound exchange and consume endpoints.

Linking a second provider still starts by moving the existing WebView session into the system browser with Better Auth's single-use token. The system browser normally retains the resulting cookie through the provider redirect, but a browser or application failure after consuming that token and before the provider callback requires the player to start linking again from the WebView. An unrelated system-browser session is not evidence of a successful transfer.

The shell preserves the full path, query, and fragment when an internal HTTPS link starts or foregrounds the application. `mobile/app.json` declares the `praetorium.gg` associated domain and Android intent filter. Production link verification also requires `APPLE_TEAM_ID` and `ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS`. The deployment serves the resulting Apple and Android association files and returns 404 rather than publishing placeholders while either platform's release identity is absent.

An updated shell declares the `app-navigation` capability and marks each document as a native application document. The web application then replaces its website header with application navigation. Phones use a fixed top bar and five bottom tabs. Layouts that are at least 1024 pixels wide move the tabs into a left rail.

The top bar keeps the Back action in a fixed location. A detail screen returns to the previous application route. A direct link without application history returns to its mapped parent route. A section root returns to the home page. The website keeps its website header.

Compact roster panes use browser history. An iOS back gesture or Android system Back action dismisses the pane before it leaves the roster. A datasheet opened from the unit picker returns to that picker. A datasheet opened from a roster unit returns to the roster. The visible Back action consumes the same history entry.

After a real background cycle, the shell nudges the WebView's browser lifecycle. This closes and reconnects Centrifugo, then refetches active TanStack Query data through the web application's existing browser handlers. The shell holds no native battle state or lifecycle-specific fetch path.

`praetorium://auth` is reserved for this handoff. Request and callback validation stay in `mobile/src/nativeAuth.ts`. The shell publishes `window.PraetoriumNative.bridgeVersion` before the web application loads. Web features require a supported bridge version and a matching capability. This prevents the deployment from sending messages to older installed shells. Bridge version 2 adds retryable, challenge-bound authentication. The web deployment retains version 1 for installed shells that are not updated. Bridge version 3 adds application navigation, native sharing, printing, battle haptics, and active-battle screen wake locks.

Store builds use `mobile/eas.json`. Apple metadata lives in `mobile/store.config.json`; Google Play metadata and both stores' manual review fields are recorded in [Mobile release](mobile-release.md).

The iOS shell receives over-the-air JavaScript updates through EAS Update. The public application uses the `stable` channel and testers use one shared `canary` channel. Canary installations always receive the latest compatible update merged to `main`; pull-request revisions are never distributed. Each update targets the native fingerprint that produced it, so an incompatible binary cannot receive it.

Checked-in GitHub workflows queue iOS deliveries through temporary tags. Each delivery finishes before the next change starts, including store submission and over-the-air publishing. Every canary and stable delivery creates a new iOS build, uploads it to TestFlight, and publishes the same merged revision over the canary or stable channel for compatible installed builds. A mobile change merged to `main` delivers both channels; an open pull request only runs validation. Android builds, updates, and store uploads remain manual and disabled until the release gate passes on a physical Android device and the Google account requirements are complete.

## Check it

`just check` formats, lints, type-checks, and tests the mobile source with the web application.

Native authentication testing requires a booted iOS Simulator, Java 21, and Maestro:

```sh
just e2e-native-auth-ios
```

The test builds the Release application and launches it one time. It completes the native Google handoff against an isolated local stack. It checks the proof exchange, authenticated redirect, proof consumption, and authenticated reload. It also checks that the account appears without another application launch.

Run this journey before pushing a change to the native shell, its dependencies, or its configuration. TestFlight submission is automatic, so the pushed commit must already have passed the release-mode journey.

The Simulator build does not have the production keychain entitlement. The test build keeps only its pending callback in memory. Production builds continue to use SecureStore. Signed physical-device builds are the verification surface for SecureStore and the real Apple and Google providers.

Physical-device verification covers iOS and Android sign-in, WebSocket reconnection, external links, file selection, printing, backgrounding, and platform back navigation.
