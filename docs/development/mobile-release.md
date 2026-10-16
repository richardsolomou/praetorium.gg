# Mobile release

This is the release gate for the `gg.praetorium` iOS and Android applications. Android delivery is disabled until the gate can be completed on a physical Android device.

## Platform requirements

Before every submission, check [Apple's SDK minimums](https://developer.apple.com/news/?id=ueeok6yw), [Google Play's target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878), and [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) against the pinned Expo SDK; do not copy their changing deadlines here. `supportsTablet` requires iPad as well as phone screenshots.

## One-time store setup

1. Enrol in the Apple Developer Program and Google Play Console. Complete Apple's agreements, tax, banking, trader-status, and contact records and Google's developer verification before building.
2. Register the iOS app as `gg.praetorium` in Certificates, Identifiers & Profiles and App Store Connect, with Associated Domains enabled.
3. Create the `gg.praetorium.web` Sign in with Apple Services ID with `praetorium.gg` and `https://praetorium.gg/api/auth/callback/apple`, grouped with the primary App ID.
4. Create a Sign in with Apple key for the primary App ID and set `APPLE_CLIENT_ID=gg.praetorium.web`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` in production. Back up the one-time `.p8` outside the repository.
5. Register `https://praetorium.gg/api/apple-notifications` as the App ID's server-to-server notification endpoint. Register the SMTP sending domain and addresses with Apple's private email relay before sending to relay addresses.
6. Create the Android app as `gg.praetorium` with Play App Signing, and record the app-signing certificate SHA-256 fingerprint, not only the upload-key fingerprint.
7. Link `mobile/` to an Expo project with `pnpm dlx eas-cli@23.2.0 init`. Do not commit generated credentials or a review-account password.
8. Create an App Store Connect team API key with Admin access and access to Certificates, Identifiers & Profiles.
9. Add GitHub Actions secrets `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_BASE64` (the base64-encoded key), and `EXPO_TOKEN`. EAS uses this key for builds and metadata sync; Expo needs no separate copy.
10. Set `ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS` in production, comma-separated only during a signing transition.
11. Before a build containing `expo-notifications` reaches `main`, enable Push Notifications for the App ID and add an APNs-enabled Apple key as the Expo project's iOS push key. The workflow freezes credentials, so regenerate the profile with `aps-environment` locally: from `mobile/`, run `pnpm dlx eas-cli@23.2.0 credentials:configure-build -p ios -e production` with `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`, `EXPO_APPLE_TEAM_TYPE`, and `EXPO_NO_CAPABILITY_SYNC=1`. Apple ID sign-in fails when the only second factor is a security key; capability sync would try to switch off Sign in with Apple, which the generated entitlements omit, and Apple rejects that.
12. Turn on Expo's enhanced push security, create a Viewer-role Expo robot token, and set it as `EXPO_PUSH_ACCESS_TOKEN` in production. Without enhanced security, anyone who knows a device token can send it a notification.
13. Before enabling Android delivery, add the Firebase `google-services.json` as `android.googleServicesFile` in `mobile/app.json` and upload its FCM V1 service-account key to Expo.

The Watch target `gg.praetorium.watch` has its own App Store profile and shares the phone's distribution certificate. Provision it before merging through the delivery workflow's `provision_watch` input, which runs [`scripts/provisionWatchIos.js`](../../scripts/provisionWatchIos.js) because EAS's non-interactive build cannot select a certificate for a new target.

## Build and upload

Run `just check` first.

[`.github/workflows/release.yml`](../../.github/workflows/release.yml) dispatches delivery only when [`scripts/iosDelivery.ts`](../../scripts/iosDelivery.ts) finds native inputs changed since the revision recorded in the `mobile-ios-stable` GitHub deployment. [`.github/workflows/mobile.yml`](../../.github/workflows/mobile.yml) builds that commit, uploads to TestFlight, and publishes the fingerprint-matched EAS Update, canary before stable; [`mobile/eas.json`](../../mobile/eas.json) owns profiles, channels, and build numbers. It never submits for public App Store review.

Inspect the last run before restarting delivery from `main`, and never start a second delivery while one is running:

```sh
gh workflow run mobile.yml --ref main
```

A manual dispatch always builds. On a feature branch it uploads only the canary binary, without OTA updates or stable delivery; add `-f provision_watch=true` to provision the Watch target:

```sh
gh workflow run mobile.yml --ref <branch> -f provision_watch=true
```

When local credentials fail, use the workflow's signing secrets before asking for a local Apple login or new key; a local failure does not show CI's key is invalid.

After the physical-device and Google account gates pass, configure a Google Play service account in EAS and deliver Android manually from `mobile/`:

```sh
pnpm dlx eas-cli@23.2.0 build --platform android --profile production
pnpm dlx eas-cli@23.2.0 submit --platform android --profile production
pnpm dlx eas-cli@23.2.0 update --platform android --channel stable --environment production
```

Add a mobile Changeset to change the public version; [`scripts/syncMobileVersion.ts`](../../scripts/syncMobileVersion.ts) copies it into `mobile/app.json`. Before merging release-tooling changes, run `pnpm version-packages` with a pending mobile Changeset in a disposable checkout, confirm both versions agree, and run `just check` on the result.

## Production identity checks

After the signed builds exist and production variables are set:

```sh
curl --fail --silent --show-error https://praetorium.gg/.well-known/apple-app-site-association
curl --fail --silent --show-error https://praetorium.gg/.well-known/assetlinks.json
```

Both must return `200` and `application/json` without a redirect. The Apple document must contain the release team ID and `gg.praetorium`; every Android fingerprint must be a Play or release signing certificate for `gg.praetorium`.

On physical devices with signed builds, open a battle link, roster link, league invitation, password-reset link, and provider callback from cold and warm starts. Simulators and unsigned packages do not prove Universal Links or Android App Links.

## Store listing

`mobile/store.config.json` is the source for the Apple listing and the Google Play full description. EAS Metadata is beta, so compare the synced App Store Connect fields with that file before submission.

Google Play listing:

- App name: `Praetorium`
- Short description: `Build Warhammer 40,000 armies and track games from setup to final score.`
- Category: Tools
- Privacy policy: `https://praetorium.gg/privacy`
- Account deletion: `https://praetorium.gg/delete-account`
- Support: `https://praetorium.gg/support`

Keep the unofficial-product disclaimer and Games Workshop attribution in every locale. Do not use Games Workshop logos or imply sponsorship anywhere in the listing.

Capture screenshots from the signed release build: roster library, roster detail, live battle tracker, mission selection, and league registration, without private email addresses, invitation tokens, unrevealed rosters, or test-provider consent screens. App Store Connect also needs a 13-inch iPad screenshot.

## Apple privacy answers

Mark these as linked to the user and not used for tracking:

| Data                                          | Purpose                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| Name and email address                        | App functionality                                                                      |
| User ID                                       | App functionality and analytics                                                        |
| Photos or videos                              | App functionality; optional profile picture                                            |
| Gameplay content                              | App functionality; rosters, battles, friendships, favourites, and league participation |
| Product interaction                           | Analytics                                                                              |
| Crash, performance, and other diagnostic data | App functionality and analytics                                                        |

These match the privacy manifest in `mobile/app.json`; the answers must also cover data collected through the WebView. See [Apple's App Privacy guidance](https://developer.apple.com/app-store/app-privacy-details/).

## Google Play Data safety answers

Declare collection of name, email address, user IDs, photos, other user-generated content, app interactions, crash logs, diagnostics, and device or other identifiers used for sessions and abuse prevention. Profile pictures are optional; account, roster, battle, and session data are required. Data is encrypted in transit, deletable on request, not sold, and not used for advertising. PostHog and the hosting and email providers are service providers; confirm the current [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) wording before relying on that exception.

State that the app creates accounts, give `https://praetorium.gg/delete-account` as the web deletion resource, and verify Profile → Account security → Permanently delete account. See [Google Play's account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

## Content and age rating

Target 13 and over; the product has no chat, ads, purchases, gambling, matchmaking, or public player discovery. Do not choose a lower violence frequency than the battle terminology and fantasy-combat references in the review build show. Keep [`catalogue/sources.json`](https://github.com/richardsolomou/praetorium.gg/blob/main/catalogue/sources.json) and the in-product attribution available during review; the app is an unofficial list builder and game tracker, not a rules source.

## Review access

Create one stable production review account with a verified email/password login, two representative rosters, one active practice battle, one finished battle, and one league registration. Keep two-factor authentication disabled unless the review notes provide a deterministic code path. Provide the same account under Play Console's App access, test it immediately before submission, and keep it active until both reviews and any appeal finish.

Review notes, after replacing the bracketed value:

> I provided a review account with saved rosters, a running practice battle, a finished battle, and a league registration. Sign in with the email and password in the review credentials, then open Battles → [active battle name] to test live tracking without a second person.
>
> The application loads the production service at `https://praetorium.gg`. The native shell adds verified links, secure system-browser authentication, native sharing and printing, battle-action haptics, and a screen wake lock during active battles. It loads trusted application pages and opens external links through the operating system. Compatible JavaScript updates are delivered through EAS Update.
>
> Supported social providers use the system authentication session. Email/password sign-in is available in the application. Account deletion is under Profile → Account security → Permanently delete account. The application has no purchases, subscriptions, ads, or chat. Players can publish rosters and share battles.
>
> Praetorium uses community-maintained catalogue and rules data under the licences recorded at `https://github.com/richardsolomou/praetorium.gg/blob/main/catalogue/sources.json`. It is unofficial and is not affiliated with or endorsed by Games Workshop.

## Physical-device gate

Complete this matrix on the exact TestFlight and Play internal-testing builds:

- Create an account with email/password and Sign in with Apple, sign in with every enabled provider, finish two-factor sign-in, link and unlink providers, reset a password, sign out, and delete a disposable account.
- Complete a battle between an iPhone and an Android phone, observing the other device update after every command.
- Background each app until the live connection closes, change the battle on the other device, and observe a reconnect and refetch on foreground.
- Disable the network during a read and a mutation, restore it, retry, and confirm no command appears twice.
- Open internal and external links, share roster and league links, print a roster, upload a profile picture, copy an export, verify Android Back, and confirm iOS cannot swipe into an empty WebView document.
- Confirm the screen stays awake only while a seated battle is open and a successful battle command gives one light haptic.
- On a signed-in device that has not answered the system prompt, Home offers notification permission, Not now survives a restart, and Profile can still grant it. With a second account, create a battle, send and accept a friend request, request, accept, and reject a league entry, change a role and team after sealing, and reveal and unseal a roster: each notice arrives once, never to the actor, and opens its page from cold and warm starts. Nothing arrives after disabling notifications or signing out.
- Check phone and tablet safe areas, software keyboards, portrait orientation, text scaling, VoiceOver, TalkBack, contrast, and touch targets.
- Run the current web deployment against the oldest supported installed shell, and the release shell against the deployed web application.

Do not submit either build for public review until the complete cycle passes on physical iOS and Android devices. Record the tested build numbers, devices, operating-system versions, date, and tester beside the release ticket.
