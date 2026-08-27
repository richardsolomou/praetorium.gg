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

The shell always loads the production service. It preserves first-party cookies, keeps `praetorium.gg` navigation inside the app, and opens other supported links with the operating system. Google and Discord authentication leaves the WebView for a system authentication session. The web application hands the resulting session back through a three-minute, single-use, hashed token; the shell redeems it into the WebView without putting it in an HTTPS URL.

`praetorium://auth` is reserved for this handoff. Keep its request and callback validation in `mobile/src/nativeAuth.ts`. The shell publishes `window.PraetoriumNative.bridgeVersion` before the web application loads; web features must require a bridge version they understand so a deployment cannot send messages to older installed shells.

## Check it

`just check` formats, lints, type-checks, and tests the mobile source with the web application. Before a mobile change is ready, also inspect it on physical iOS and Android devices and exercise sign-in, WebSocket reconnection, external links, file selection, printing, backgrounding, and platform back navigation.
