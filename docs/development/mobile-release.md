# Mobile release

This is the release gate for the `gg.praetorium` iOS and Android applications. Android delivery is disabled until the release gate can be completed on a physical Android device. Recheck the linked store rules before every submission because their dates and SDK floors change.

## Current platform floor

- Apple requires uploads from 28 April 2026 to use the iOS 26 SDK or later. Build the archive with Xcode 26 or later. See [Apple's SDK minimum requirements](https://developer.apple.com/news/?id=ueeok6yw).
- Google Play requires new apps and updates submitted from 31 August 2026 to target Android 16, API level 36. Expo SDK 57 generates that target. See [Google Play's target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878).
- Apple requires at least one current iPhone screenshot and, because `supportsTablet` is enabled, at least one 13-inch iPad screenshot. Use an exact size from [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

## One-time store setup

1. Enrol the publisher in the Apple Developer Program and Google Play Console. Complete Apple's agreements, tax, banking, trader-status, and contact records and Google's developer verification before building.
2. Register the iOS app as `gg.praetorium` in Certificates, Identifiers & Profiles and App Store Connect. Enable Associated Domains for the identifier.
3. Create the `gg.praetorium.web` Sign in with Apple Services ID, add `praetorium.gg` and `https://praetorium.gg/api/auth/callback/apple`, and group it with the primary App ID.
4. Create a Sign in with Apple key for the primary App ID. Configure `APPLE_CLIENT_ID=gg.praetorium.web`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` in production so the server generates current client-secret JWTs. Keep the one-time `.p8` download outside the repository and back it up securely.
5. Register `https://praetorium.gg/api/apple-notifications` as the primary App ID's server-to-server notification endpoint. Register the SMTP sending domain and addresses with Apple's private email relay before sending to relay addresses.
6. Create the Android app as `gg.praetorium` in Play Console and enable Play App Signing. Record the Play app-signing certificate SHA-256 fingerprint, not only an upload-key fingerprint.
7. Link `mobile/` to an Expo project with `pnpm dlx eas-cli@latest init`. Connect the GitHub repository with `/mobile` as its base directory. Do not commit generated credentials or a review-account password.
8. Set `ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS` in the production deployment. Keep multiple Android fingerprints comma-separated only during a signing transition.

## Build and upload

Run the repository gate first:

```sh
just check
```

The checked-in GitHub and EAS workflows are the normal iOS delivery path. GitHub queues canary deliveries and stable deliveries, dispatches each current revision through a temporary tag, and waits for EAS to finish before dispatching the next change. Every delivery creates and uploads a new iOS binary, then publishes an over-the-air iOS update for compatible installed builds. Canary jobs use the preview EAS environment, which must not contain private upload credentials. Merging that pull request to `main` delivers the stable channel with the production environment. A delivery runs to completion so a later push cannot strand an App Store submission or let an older update finish last. Android builds, updates, and Play uploads remain manual and disabled until the release gate passes on a physical Android device and the Google account requirements are complete.

Use the following commands only to recover or inspect the automated flow. Create a signed iOS production build from `mobile/` with:

```sh
pnpm dlx eas-cli@latest build --platform ios --profile production
```

Upload the iOS build and its checked-in App Store metadata:

```sh
pnpm dlx eas-cli@latest submit --platform ios --profile production
```

After completing physical-device verification and the Google account requirements, configure a Google Play service account in EAS before enabling Android automation. EAS Submit can create the first internal-testing release after the app exists in Play Console; a manual first upload is optional. Build and upload manually with:

```sh
pnpm dlx eas-cli@latest build --platform android --profile production
pnpm dlx eas-cli@latest submit --platform android --profile production
pnpm dlx eas-cli@latest update --platform android --channel stable --environment production
```

EAS manages `CFBundleVersion` and `versionCode` remotely and increments them for canary and production builds. Change the user-facing version in `mobile/app.json` and `mobile/package.json` together for each public application release. The native shell reads that version from the installed binary. EAS Update uses the native fingerprint as its runtime version, so incompatible binaries never receive the same over-the-air bundle.

## Production identity checks

Run these after the signed builds exist and the production variables are set:

```sh
curl --fail --silent --show-error https://praetorium.gg/.well-known/apple-app-site-association
curl --fail --silent --show-error https://praetorium.gg/.well-known/assetlinks.json
```

Confirm that the Apple document contains the release team ID and `gg.praetorium`. Confirm that every Android fingerprint is a Play or release signing certificate for `gg.praetorium`. Both requests must return `200`, `application/json`, and no redirect.

Install the signed builds on physical devices. Open a battle link, roster link, league invitation, password-reset link, and provider callback from a cold start and a warm start. A simulator or an unsigned package does not prove Universal Links or Android App Links.

## Store listing

`mobile/store.config.json` is the source for Apple title, subtitle, description, keywords, support URL, marketing URL, and privacy URL. EAS Metadata is still a beta service, so compare the synced App Store Connect fields against that file before submission.

Use this Google Play listing:

- App name: `Praetorium`
- Short description: `Build Warhammer 40,000 armies and track games from setup to final score.`
- Category: Tools
- Privacy policy: `https://praetorium.gg/privacy`
- Account deletion: `https://praetorium.gg/delete-account`
- Support: `https://praetorium.gg/support`

Use the full description from `mobile/store.config.json` on Google Play too. Keep the unofficial-product disclaimer and Games Workshop attribution in every locale. Do not use Games Workshop logos or imply sponsorship in the icon, title, feature graphic, screenshots, or copy.

Capture real application screens from the signed release build. Use a representative roster library, roster detail, live battle tracker, mission selection, and league registration. Do not include private email addresses, invitation tokens, unrevealed rosters, or test-provider consent screens. Upload current phone screenshots to both stores and a 13-inch iPad screenshot to App Store Connect.

## Apple privacy answers

The app does not track people for advertising. Mark these as linked to the user and not used for tracking:

| Data                                          | Purpose                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| Name and email address                        | App functionality                                                                      |
| User ID                                       | App functionality and analytics                                                        |
| Photos or videos                              | App functionality; optional profile picture                                            |
| Gameplay content                              | App functionality; rosters, battles, friendships, favourites, and league participation |
| Product interaction                           | Analytics                                                                              |
| Crash, performance, and other diagnostic data | App functionality and analytics                                                        |

The values match the application privacy manifest in `mobile/app.json`. The App Store Connect answers must also cover data collected through the WebView. See [Apple's App Privacy guidance](https://developer.apple.com/app-store/app-privacy-details/).

## Google Play Data safety answers

Declare collection of name, email address, user IDs, photos, other user-generated content, app interactions, crash logs, diagnostics, and device or other identifiers used for sessions and abuse prevention. Mark profile pictures as optional and the account, roster, battle, and session data as required for the related functionality.

Declare that data is encrypted in transit, users can request deletion, data is not sold, and data is not used for advertising. PostHog and the hosting and email providers process data as service providers. Confirm the current Play Console wording before relying on the service-provider exception. See [Google Play's Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469).

The form must say that the app creates accounts. Provide `https://praetorium.gg/delete-account` as the web deletion resource and verify the in-app Profile → Account security → Permanently delete account flow. See [Google Play's account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

## Content and age rating

Set the target audience to 13 and over. The product has no chat, ads, purchases, gambling, matchmaking, or public player discovery. Answer the store questionnaires for the battle terminology and Warhammer 40,000 fantasy-combat references visible in the submitted screenshots. Do not choose a lower violence frequency than the review build shows.

The catalogue and rules sources, licences, and attribution are recorded in `catalogue/README.md`. Keep that file and the in-product attribution available during review. The application is a list builder and live game tracker, not a rules encyclopedia or an official Games Workshop product.

## Review access

Create one stable review account in production. Give it a verified email/password login, two representative rosters, one active practice battle, one finished battle, and one league registration. Keep two-factor authentication disabled for that account unless the review notes provide a deterministic code path.

Use these review notes after replacing the bracketed values:

> I provided a review account with saved rosters, a running practice battle, a finished battle, and a league registration. Sign in with the email and password in the review credentials, then open Battles → [active battle name] to test live tracking without a second person.
>
> The application loads the production service at `https://praetorium.gg`. The native shell adds verified links, secure system-browser authentication, native sharing and printing, battle-action haptics, and a screen wake lock during active battles. It does not download executable code or expose an open browser.
>
> Apple, Google, and Discord sign-in use the system authentication session. Email/password sign-in is available in the application. Account deletion is under Profile → Account security → Permanently delete account. The application has no purchases, subscriptions, ads, chat, or user-posted public content.
>
> Praetorium uses community-maintained catalogue and rules data under the licences recorded at `https://github.com/richardsolomou/praetorium.gg/blob/main/catalogue/README.md`. It is unofficial and is not affiliated with or endorsed by Games Workshop.

Provide the same review account under Play Console's App access section. Test the credentials immediately before submission and keep them active until both reviews and any appeal are complete.

## Physical-device gate

Complete this matrix on the exact TestFlight and Play internal-testing builds:

- Create an account with email/password and Sign in with Apple, sign in with every enabled provider, finish two-factor sign-in, link and unlink providers, reset a password, sign out, and delete a disposable account.
- Complete a battle from an iPhone and an Android phone. Observe the other device update after every command.
- Background each app long enough to close the live connection, change the battle on the other device, foreground it, and observe a reconnect and refetch before acting.
- Disable the network during a read and a mutation, restore it, retry, and confirm that no command appears twice.
- Open internal and external links, share roster and league links, print a roster, upload a profile picture, copy an export, and verify the Android back action and iOS back gesture.
- Confirm that the screen stays awake only while a seated battle is open and that a successful battle command gives one light haptic response.
- Check phone and tablet safe areas, software keyboards, portrait orientation, text scaling, VoiceOver, TalkBack, contrast, and touch targets.
- Run the current web deployment against the oldest supported installed shell and the release shell against the deployed web application.

Do not submit either build for public store review until the complete cycle passes on physical iOS and Android devices. Record the tested build numbers, devices, operating-system versions, date, and tester beside the release ticket.
