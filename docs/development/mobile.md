# Mobile application

The iOS and Android application uses a thin Expo shell around the existing responsive interface. The web application owns every visible feature screen and its application navigation. React Native owns safe areas, system authentication, sharing, printing, haptics, and screen wake locks. The server remains authoritative for accounts, rosters, and battles.

## Run it

Install the repository dependencies, then start Expo:

```sh
just install
just mobile
```

Press `i` for the iOS simulator or `a` for an Android emulator. The platform-specific shortcuts are `just mobile-ios` and `just mobile-android`.

Expo generates `mobile/ios` and `mobile/android` from `mobile/app.json`; both directories are gitignored and disposable. Persistent native configuration lives in the app configuration rather than those generated projects.

Release builds load the supported production service, while development recipes use the local service. The shell preserves first-party cookies, keeps ordinary application navigation in the main WebView, and opens other supported links with the operating system. Its injected bridge captures both `_blank` links and `window.open`. A trusted application new window loads in the main WebView, because the application has no second window; an external URL still goes to the operating system. The WebView's native new-window event is the fallback. Apple, Google and Discord authentication leaves the WebView for a system authentication session. The local proof uses a fifteen-minute envelope around Better Auth's ten-minute provider state window. A valid callback resets the local proof to the server receipt's three-minute window.

An ordinary launch opens the WebView as soon as the initial link is known, while the shell reads any pending sign-in receipt from secure storage. A sign-in callback waits for that receipt before opening the WebView. If an interrupted sign-in is recovered after an ordinary launch, the shell remounts the current page before submitting the receipt.

The web application binds the receipt to the shell, provider, action, destination, user, and server session. The WebView submits the receipt as a top-level POST request. The server validates the receipt, sets the session cookie, and redirects the same WebView to the bound destination. This transaction stores the cookie before the redirect loads. A temporary query value prevents a cached signed-out document. The injected bridge removes this value before the web application starts.

The shell remounts the current trusted WebView location after receiving the callback, which starts it with empty `sessionStorage`: a visitor's unsaved list does not survive Apple, Google or Discord sign-in in the application, though it survives email sign-in and any web sign-in that stays in the tab. The shell then submits the proof only after the new document finishes loading. The destination reports success to the shell after the redirect finishes loading. The shell then removes its local proof and consumes the server receipt. Receipt consumption reloads the destination once so the interface reads the committed session. An application or renderer restart retries the same receipt. A transport failure keeps the proof for an explicit retry. An invalid or expired receipt redirects to the sign-in page and removes the proof. The token and verifier stay in request bodies. Only the non-secret exchange ID appears in the temporary query value. WKWebView can omit the `Origin` header from these requests. The server accepts a missing or null `Origin` only on the proof-bound exchange and consume endpoints.

Linking a second provider still starts by moving the existing WebView session into the system browser with Better Auth's single-use token. The system browser normally retains the resulting cookie through the provider redirect, but a browser or application failure after consuming that token and before the provider callback requires the player to start linking again from the WebView. An unrelated system-browser session is not evidence of a successful transfer.

The shell preserves the full path, query, and fragment when an internal HTTPS link starts or foregrounds the application. `mobile/app.json` declares the `praetorium.gg` associated domain and Android intent filter. Production link verification also requires `APPLE_TEAM_ID` and `ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS`. The deployment serves the resulting Apple and Android association files and returns 404 rather than publishing placeholders while either platform's release identity is absent.

The shell marks each document as an installed-application document. The web application owns its application navigation on both mobile web and native phones: a compact utility bar provides Home, search, and the player's account, while a bottom bar provides Battles, Rosters, Factions, Missions, and More. More is an application page for Home, Leagues, Leaderboard, Rules, and secondary destinations such as Friends, Admin, and Feedback. The homepage belongs to no tab, so none is selected there. Native layouts that are at least 1024 pixels wide move the bottom navigation into a left rail. The website returns to its desktop header at 860 pixels. Immersive roster screens omit the utility bar.

The overflow routes keep their own section history even though they have no dedicated tab. On mobile web and in the native application, the session records the last location, history state, and scroll positions of every section in `src/client/features/shell/nativeTabs.ts`, keyed by the section `nativeNavigation` derives from the path. This keeps an open roster unit open when another section is visited. Tapping the section you are already in goes to its top instead. The record lives in `sessionStorage`, so a cold start opens every section at its top.

Every section shares one WebView history stack, so the web application records the section of each history entry and tells the shell whether going back stays inside the current section. The Android system Back action is available only while that is true. The iOS WebView gesture stays disabled because its native history can expose an empty document below the application's first route. Detail screens use their own breadcrumbs and close actions instead of reserving application chrome for Back. Mobile web uses the browser's Back action.

Compact roster panes use browser history, which is inside the roster section. Their own close action or the Android system Back action dismisses the pane before it leaves the roster. A datasheet opened from the unit picker returns to that picker. A datasheet opened from a roster unit returns to the roster.

A compact unit pane is a screen inside the roster tab whenever the application tab bar is visible: it stops above the tab bar, and the tab bar stays live beside it on mobile web and in the native application. Required battle prompts block battle actions but leave the application tab bar live, so a player can inspect a roster, mission, or rule and return to the unanswered prompt. At intermediate website widths that use the desktop header, the same compact pane remains a modal dialog.

After a real background cycle, the shell nudges the WebView's browser lifecycle. This reconnects realtime updates, then refetches active TanStack Query data through the web application's existing browser handlers. The shell holds no native battle state or lifecycle-specific fetch path.

## Notifications

The shell uses `expo-notifications` and Expo's push service, which delivers through APNs and FCM. The web application owns the notification setting and every request to the server; the shell only answers whether this device may show notifications and, once it may, what its Expo push token is. The web application sends a `native-push` message with a request ID, and the shell answers by dispatching a `praetorium-native-push` event carrying the same ID. The system permission prompt appears only when the player presses Allow on this device on their profile. No prompt appears at launch or sign-in.

Every document load while signed in repeats the check without a prompt. When permission is already granted, the web application registers the token through the `registerPushDevice` mutation. That mutation is an ordinary `fetch`, which WKWebView sends with an `Origin` header, so it keeps the standard mutation origin check. It refuses a missing or null `Origin`, a stale session cookie, and an impersonated session. Registering again moves the token to the account signed in now. Signing out removes the token before the session ends.

The server raises a notice after the write that caused it commits: a battle that seats the player, a friend request to them, a friend request or invite they sent being accepted, and a league entry acceptance, reveal, or roster unsealing. It never notifies the player who acted, a practice opponent, or an account that turned the setting off. Delivery runs after the response and never delays or fails the request. `src/adapters/push.ts` sends at most one hundred messages per request with a timeout and bounded retries. It removes tokens that Expo reports as `DeviceNotRegistered` in a ticket or in the receipt that it checks fifteen minutes later. The payload has a title, a body, and a path on the application origin, and it contains only what the recipient can already read.

Tapping a notification opens its path in the main WebView through the same navigation as a verified link. The shell also uses the notification that launched it as the first page when no link launched it. A notification that arrives while the application is open shows as a silent banner.

`praetorium://auth` is reserved for this handoff. Request and callback validation stay in `mobile/src/nativeAuth.ts`. The shell publishes `window.PraetoriumNative.bridgeVersion` before the web application loads. Web features require a supported bridge version and a matching capability. This prevents the deployment from sending messages to older installed shells. Bridge version 2 adds retryable, challenge-bound authentication. The web deployment retains version 1 for installed shells that are not updated. Bridge version 3 adds application navigation, native sharing, printing, battle haptics, active-battle screen wake locks, and the `back-gesture` capability the web application uses to allow or refuse the Android system back action. Shells built with `expo-notifications` also list the `notifications` capability; older version 3 shells do not, so the web application does not show them the device control.

GitHub builds the iOS application with EAS Build locally on its macOS runner, uploads it with Fastlane, and publishes its JavaScript updates with EAS Update. EAS supplies the managed distribution certificate and provisioning profile without running the build on EAS infrastructure. Android builds use `mobile/eas.json`. Apple metadata lives in `mobile/store.config.json`; Google Play metadata and both stores' manual review fields are recorded in [Mobile release](mobile-release.md).

The iOS shell receives over-the-air JavaScript updates through EAS Update. The public application uses the `stable` channel and testers use one shared `canary` channel. Canary installations always receive the latest compatible update merged to `main`; pull-request revisions are never distributed. Each update targets the native fingerprint that produced it, so an incompatible binary cannot receive it.

The GitHub workflow builds the canary and stable iOS applications in sequence on macOS 26. It always builds canary first and stable second. EAS assigns each build the next version and signs it with the project's existing managed credentials. The build freezes credentials so a clean runner cannot replace them or create another Apple certificate. The workflow exposes the Fastlane version pinned by Bundler to the EAS local builder, which invokes the executable directly. Fastlane uploads each archive and waits for TestFlight processing. Repeated PostHog source-map uploads keep the existing symbol set when a rebuild produces the same chunk identifier with different metadata, so that conflict does not stop TestFlight delivery. EAS Update then publishes the same merged revision on the matching channel for compatible installed builds. A running delivery finishes before the next delivery starts. GitHub replaces an older queued delivery when a newer mobile revision reaches `main`. An open pull request only runs validation. An automated release candidate skips repeated iOS validation because its application source already passed on the originating pull request and only the release metadata changed. Android builds, updates, and store uploads remain manual. Android delivery stays disabled until the physical-device release gate and Google account requirements are complete.

## Check it

`just check` formats, lints, type-checks, and tests the mobile source with the web application.

Native authentication testing requires a booted iOS Simulator, Java 21, and Maestro:

```sh
just e2e-native-auth-ios
```

The test builds the Release application and launches it one time. It completes the native Google handoff against an isolated local stack. It checks the proof exchange, authenticated redirect, proof consumption, and authenticated reload. It also checks that the account appears without another application launch.

Run this journey before pushing a change to the native shell, its dependencies, or its configuration. TestFlight submission is automatic, so the pushed commit must already have passed the release-mode journey.

The Simulator build does not have the production keychain entitlement. The test build keeps only its pending callback in memory. Production builds continue to use SecureStore. Signed physical-device builds are the verification surface for SecureStore and the real Apple and Google providers.

Physical-device verification covers iOS and Android sign-in, WebSocket reconnection, external links, file selection, printing, backgrounding, platform back navigation, and push notification delivery. A simulator can show the permission prompt and register a token, but only a signed build with production push credentials proves delivery.
