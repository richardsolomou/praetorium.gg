# Mobile release

This is the release gate for the `gg.praetorium` iOS and Android applications. Android delivery is disabled until the release gate can be completed on a physical Android device. Recheck the linked store rules before every submission because their dates and SDK floors change.

## Platform requirements

Before submission, check [Apple's SDK minimums](https://developer.apple.com/news/?id=ueeok6yw), [Google Play's target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878), and [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) against the pinned Expo SDK and generated projects. `supportsTablet` requires iPad screenshots as well as phone screenshots. The workflow owns the runner/tool versions; do not copy changing deadlines here.

## One-time store setup

1. Enrol the publisher in the Apple Developer Program and Google Play Console. Complete Apple's agreements, tax, banking, trader-status, and contact records and Google's developer verification before building.
2. Register the iOS app as `gg.praetorium` in Certificates, Identifiers & Profiles and App Store Connect. Enable Associated Domains for the identifier.
3. Create the `gg.praetorium.web` Sign in with Apple Services ID, add `praetorium.gg` and `https://praetorium.gg/api/auth/callback/apple`, and group it with the primary App ID.
4. Create a Sign in with Apple key for the primary App ID. Configure `APPLE_CLIENT_ID=gg.praetorium.web`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` in production so the server generates current client-secret JWTs. Keep the one-time `.p8` download outside the repository and back it up securely.
5. Register `https://praetorium.gg/api/apple-notifications` as the primary App ID's server-to-server notification endpoint. Register the SMTP sending domain and addresses with Apple's private email relay before sending to relay addresses.
6. Create the Android app as `gg.praetorium` in Play Console and enable Play App Signing. Record the Play app-signing certificate SHA-256 fingerprint, not only an upload-key fingerprint.
7. Link `mobile/` to an Expo project with `pnpm dlx eas-cli@23.2.0 init`. Do not commit generated credentials or a review-account password.
8. Create an App Store Connect team API key with Admin access. Give the key access to Certificates, Identifiers & Profiles.
9. Add `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_BASE64`, and `EXPO_TOKEN` as GitHub Actions secrets. Store the base64-encoded contents of the API key in `APP_STORE_CONNECT_KEY_BASE64`.
10. Set `ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS` in the production deployment. Keep multiple Android fingerprints comma-separated only during a signing transition.
11. Enable Push Notifications for the `gg.praetorium` App ID in the developer portal, enable the APNs service on an Apple key, and add that key to the Expo project's iOS push key. Then regenerate the managed provisioning profile with the `aps-environment` entitlement by running `pnpm dlx eas-cli@23.2.0 credentials:configure-build -p ios -e production` from `mobile/`, authenticated with the App Store Connect API key through `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID` and `EXPO_APPLE_TEAM_TYPE`, because Apple ID sign-in fails when the only second factor is a security key. Set `EXPO_NO_CAPABILITY_SYNC=1` as well: the app's generated entitlements omit Sign in with Apple, which the web flow handles, so capability sync tries to switch it off and Apple rejects the request. The GitHub workflow freezes credentials, so it cannot add the capability itself. Complete this step before a build that contains `expo-notifications` reaches `main`.
12. Turn on Expo's enhanced push security for the project, create an Expo robot access token with the Viewer role, and set it as `EXPO_PUSH_ACCESS_TOKEN` in the production deployment. Without enhanced security, anyone who knows a device's token can send it a notification.
13. Before enabling Android delivery, add the Firebase project's `google-services.json` as `android.googleServicesFile` in `mobile/app.json` and upload its FCM V1 service-account key to the Expo project.

The iOS delivery workflow passes the GitHub App Store Connect key to EAS for builds and metadata sync. It does not need a separate App Store Connect key stored in Expo.

The embedded Watch application uses `gg.praetorium.watch` and its own App Store provisioning profile, sharing the phone's distribution certificate. `mobile/app.json` declares `PraetoriumWatch` to EAS before prebuild so managed builds collect both targets' credentials. Provision it through the delivery workflow's `provision_watch` input before merging; GitHub's stored Apple key handles registration and EAS credential storage without a local login. [`scripts/provisionWatchIos.js`](../../scripts/provisionWatchIos.js) uses the pinned EAS CLI's credential APIs because its non-interactive build command cannot select a distribution certificate for a new target. It retains an existing valid Watch profile and validates a new profile before the frozen build. EAS applies the remote build number to both targets. The Watch target includes its own privacy manifest for local UserDefaults preferences.

## Build and upload

Run the repository gate first:

```sh
just check
```

[`.github/workflows/mobile.yml`](../../.github/workflows/mobile.yml) owns iOS delivery after matching changes reach `main`. It builds/signs on the GitHub runner through EAS with frozen managed credentials, then Fastlane uploads and waits for TestFlight processing, followed by the compatible EAS Update. Canary precedes stable; only one delivery runs at a time. Pull requests validate without distribution. A manual dispatch on a feature branch builds and uploads only the canary binary; it does not publish OTA updates or run stable delivery. The stable path also syncs `mobile/store.config.json`. This automation uploads builds and updates; it does not submit them for public App Store review.

[`mobile/eas.json`](../../mobile/eas.json) owns profiles, environments, channels, and build-number increments. Canary uses preview and stable uses production. Updates target the native fingerprint; incompatible binaries cannot receive them. Android delivery remains manual and disabled until the physical-device and Google account gates pass.

Use the following command to restart both iOS deliveries from `main`:

```sh
gh workflow run mobile.yml --ref main
```

Inspect the workflow run before you restart it. Do not start a second delivery while one is running.

To provision the Watch target and verify a feature branch through TestFlight, use its branch name:

```sh
gh workflow run mobile.yml --ref feat/apple-watch-companion -f provision_watch=true
```

Use GitHub's existing signing secrets first when local credentials are missing or stale. Check the delivery run before asking for a local Apple login or replacement key; a local authentication failure does not establish that CI's key is invalid.

After completing physical-device verification and the Google account requirements, configure a Google Play service account in EAS. Run these commands from `mobile/`:

```sh
pnpm dlx eas-cli@23.2.0 build --platform android --profile production
pnpm dlx eas-cli@23.2.0 submit --platform android --profile production
pnpm dlx eas-cli@23.2.0 update --platform android --channel stable --environment production
```

Add a Changeset for the mobile package when changing the public application version. `pnpm version-packages` runs [`scripts/syncMobileVersion.ts`](../../scripts/syncMobileVersion.ts) after Changesets to copy the package version into `mobile/app.json` and format it. Before merging release-tooling changes, exercise this command with a pending mobile Changeset in a disposable checkout, confirm that both versions agree, and run `just check` against that generated release tree. The shell reads the installed binary's version; EAS owns automatic build-number increments. [Mobile](mobile.md#check-it) owns the mandatory release-mode journey before pushing shell, dependency, or configuration changes.

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
> The application loads the production service at `https://praetorium.gg`. The native shell adds verified links, secure system-browser authentication, native sharing and printing, battle-action haptics, and a screen wake lock during active battles. It loads trusted application pages and opens external links through the operating system. Compatible JavaScript updates are delivered through EAS Update.
>
> Supported social providers use the system authentication session. Email/password sign-in is available in the application. Account deletion is under Profile → Account security → Permanently delete account. The application has no purchases, subscriptions, ads, or chat. Players can publish rosters and share battles.
>
> Praetorium uses community-maintained catalogue and rules data under the licences recorded at `https://github.com/richardsolomou/praetorium.gg/blob/main/catalogue/README.md`. It is unofficial and is not affiliated with or endorsed by Games Workshop.

Provide the same review account under Play Console's App access section. Test the credentials immediately before submission and keep them active until both reviews and any appeal are complete.

## Physical-device gate

Complete this matrix on the exact TestFlight and Play internal-testing builds:

- Create an account with email/password and Sign in with Apple, sign in with every enabled provider, finish two-factor sign-in, link and unlink providers, reset a password, sign out, and delete a disposable account.
- Complete a battle from an iPhone and an Android phone. Observe the other device update after every command.
- Background each app long enough to close the live connection, change the battle on the other device, foreground it, and observe a reconnect and refetch before acting.
- Disable the network during a read and a mutation, restore it, retry, and confirm that no command appears twice.
- Open internal and external links, share roster and league links, print a roster, upload a profile picture, copy an export, verify the Android system Back action, and confirm that iOS cannot swipe into an empty WebView document.
- Confirm that the screen stays awake only while a seated battle is open and that a successful battle command gives one light haptic response.
- Confirm that Home offers notification permission on a signed-in device that has not answered the system prompt, that Not now keeps the offer dismissed after a restart, and that Profile can still grant permission. Allow notifications, then have a second account create a battle, send and accept a friend request, and request, accept, and reject a league entry. Change a role and team after rosters are sealed, then reveal and unseal a roster. Confirm that each relevant notice arrives once, that the acting account receives nothing, and that tapping each one from a cold start and a warm start opens its page. Turn off notifications in the device settings and confirm that nothing arrives. Sign out and confirm that nothing arrives.
- Check phone and tablet safe areas, software keyboards, portrait orientation, text scaling, VoiceOver, TalkBack, contrast, and touch targets.
- Run the current web deployment against the oldest supported installed shell and the release shell against the deployed web application.

Do not submit either build for public store review until the complete cycle passes on physical iOS and Android devices. Record the tested build numbers, devices, operating-system versions, date, and tester beside the release ticket.
