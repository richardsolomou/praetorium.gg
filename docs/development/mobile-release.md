# Mobile release

Android delivery stays disabled until the [physical-device gate](#physical-device-gate) passes on an Android device. Before every submission, check Apple's SDK minimums, Google Play's target API level, and Apple's screenshot specifications against the pinned Expo SDK.

## One-time store setup

1. Enrol in the Apple Developer Program and Google Play Console; complete Apple's agreements, tax, banking, trader-status, and contact records and Google's developer verification.
2. Register iOS app `gg.praetorium` in Certificates, Identifiers & Profiles and App Store Connect, with Associated Domains enabled.
3. Create Sign in with Apple Services ID `gg.praetorium.web` with domain `praetorium.gg` and return URL `https://praetorium.gg/api/auth/callback/apple`, grouped with the primary App ID.
4. Create a Sign in with Apple key; set `APPLE_CLIENT_ID=gg.praetorium.web`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` in production. Back up the `.p8` outside the repository.
5. Register `https://praetorium.gg/api/apple-notifications` as the App ID's server-to-server notification endpoint. Register the SMTP sending domain and addresses with Apple's private email relay.
6. Create Android app `gg.praetorium` with Play App Signing; record the app-signing (not upload-key) SHA-256 fingerprint.
7. From `mobile/`, run `pnpm dlx eas-cli@23.2.0 init`. Never commit generated credentials or a review-account password.
8. Create an App Store Connect team API key with Admin access and Certificates, Identifiers & Profiles access.
9. Add GitHub Actions secrets `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_BASE64`, and `EXPO_TOKEN`.
10. Set `ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS` in production (comma-separated only during a signing transition).
11. Enable Push Notifications for the App ID, add an APNs key as the Expo project's iOS push key, and from `mobile/` run `pnpm dlx eas-cli@23.2.0 credentials:configure-build -p ios -e production` with `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`, `EXPO_APPLE_TEAM_TYPE`, and `EXPO_NO_CAPABILITY_SYNC=1` (capability sync tries to disable Sign in with Apple).
12. Turn on Expo enhanced push security and set a Viewer-role Expo robot token as `EXPO_PUSH_ACCESS_TOKEN` in production.
13. Before enabling Android delivery, set `android.googleServicesFile` in `mobile/app.json` to the Firebase `google-services.json` and upload its FCM V1 service-account key to Expo.
14. Provision the Watch target `gg.praetorium.watch` by dispatching `mobile.yml` with `-f provision_watch=true`.

## Delivery

- Never start `mobile.yml` while a run is in progress; inspect the last run before restarting. It never submits for public review.
- `-f force_build=false` publishes an OTA update after changing public JavaScript variables in EAS.
- When local credentials fail, use the workflow's signing secrets before asking for an Apple login or new key.
- After the gates pass, configure a Google Play service account in EAS and deliver Android manually from `mobile/`:

```sh
pnpm dlx eas-cli@23.2.0 build --platform android --profile production
pnpm dlx eas-cli@23.2.0 submit --platform android --profile production
pnpm dlx eas-cli@23.2.0 update --platform android --channel stable --environment production
```

## Production identity checks

```sh
curl --fail --silent --show-error https://praetorium.gg/.well-known/apple-app-site-association
curl --fail --silent --show-error https://praetorium.gg/.well-known/assetlinks.json
```

Both return `200` `application/json` without a redirect, with the release team ID, `gg.praetorium`, and only Play or release signing fingerprints.

## Store listing

`mobile/store.config.json` is the source for the Apple listing and the Google Play full description. Enter in Play Console:

- App name `Praetorium`; category Tools
- Short description: `Build Warhammer 40,000 armies and track games from setup to final score.`
- Privacy policy `https://praetorium.gg/privacy`; account deletion `https://praetorium.gg/delete-account`; support `https://praetorium.gg/support`

Keep the unofficial-product disclaimer and Games Workshop attribution in every locale; never use Games Workshop logos or imply sponsorship. Screenshots come from the signed release build (including a 13-inch iPad set) without private emails, invitation tokens, unrevealed rosters, or test-provider consent screens.

## Privacy answers

Apple, all linked to the user and not used for tracking:

| Data                                | Purpose                                      |
| ----------------------------------- | -------------------------------------------- |
| Name and email address              | App functionality                            |
| User ID                             | App functionality and analytics              |
| Photos or videos                    | App functionality (optional profile picture) |
| Gameplay content                    | App functionality                            |
| Product interaction                 | Analytics                                    |
| Crash, performance, and diagnostics | App functionality and analytics              |

Google Play Data safety: name, email, user IDs, photos, other user-generated content, app interactions, crash logs, diagnostics, and device or other identifiers. Profile pictures optional; account, roster, battle, and session data required. Encrypted in transit, deletable on request, not sold, no advertising; PostHog and hosting and email providers are service providers. The app creates accounts; web deletion resource `https://praetorium.gg/delete-account`.

Content rating: 13 and over; no chat, ads, purchases, gambling, or matchmaking. Public clubs list their members to anyone. Do not understate fantasy-combat violence.

## Review access

1. Create one production review account with verified email/password, two rosters, one active practice battle, one finished battle, and one league registration; two-factor off.
2. Give it to both App Store Connect and Play Console App access; test it just before submission and keep it active until reviews and appeals finish.
3. Review notes: sign in with the review credentials, then open Battles → the active battle to test live tracking alone. Mention the production service URL, native features (verified links, system-browser authentication, sharing, printing, haptics, wake lock, EAS Update), account deletion under Profile → Delete account, no purchases, ads, or chat, data licences at `https://github.com/richardsolomou/praetorium.gg/blob/main/catalogue/sources.json`, and no Games Workshop affiliation.

## Physical-device gate

On the exact TestFlight and Play internal-testing builds, on physical iOS and Android devices:

1. Every sign-in provider, email/password and Apple signup, two-factor, link/unlink, password reset, sign-out, account deletion.
2. A battle between an iPhone and an Android phone, each updating after every command, including after backgrounding and after network loss mid-mutation (no duplicate command).
3. Battle, roster, league invitation, password-reset, and provider-callback links from cold and warm starts.
4. Sharing, printing (inspect every page of a saved PDF), profile picture upload, export copy, Android Back, no iOS swipe into an empty WebView document.
5. Wake lock only in a seated battle; one light haptic per command.
6. Notifications: Home offer and Not now persist; each notice arrives once, never to the actor, opens its page; nothing after disabling or signing out.
7. Safe areas, keyboards, text scaling, VoiceOver, TalkBack, contrast, touch targets.
8. Current web against the oldest supported shell, and the release shell against deployed web.
9. Apple Watch: wrist-down refresh, paired delivery, haptics.

Record build numbers, devices, OS versions, date, and tester beside the release ticket. Submit neither build for public review until every step passes.
