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

The shell always loads the production service. It preserves first-party cookies, keeps `praetorium.gg` navigation inside the app, and opens other supported links with the operating system. Google and Discord authentication still need the system-browser exchange described in [issue #265](https://github.com/richardsolomou/praetorium.gg/issues/265) before a store release.

## Check it

`just check` formats, lints, type-checks, and tests the mobile source with the web application. Before a mobile change is ready, also inspect it on physical iOS and Android devices and exercise sign-in, WebSocket reconnection, external links, file selection, printing, backgrounding, and platform back navigation.
