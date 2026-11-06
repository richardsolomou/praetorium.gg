/** The repository, which is the product's other front door. */
export const SOURCE = 'https://github.com/richardsolomou/praetorium.gg'

export const NEW_ISSUE = `${SOURCE}/issues/new`

export const SPONSOR = 'https://github.com/sponsors/richardsolomou'

export const DISCORD = 'https://discord.gg/RFUMZNFwMu'

export const PRIVACY_EMAIL = 'privacy@praetorium.gg'

export const APP_STORE_ID = '6806875244'

/** Without a country code, so the App Store opens in the visitor's own storefront. */
export const APP_STORE = `https://apps.apple.com/app/praetorium-gg/id${APP_STORE_ID}`

export const GOOGLE_PLAY = 'https://play.google.com/store/apps/details?id=gg.praetorium'

/**
 * The Android closed test: Play lets only members of its testers' group opt in, so the steps run group, opt-in, install.
 * Unset it to hide the Google Play badge.
 */
export const ANDROID_BETA: { group: string; optIn: string } | undefined = {
  // About, not the group's front page: signed out, the front page reads "You don't have permission" and offers no way in.
  group: 'https://groups.google.com/g/praetorium-android-beta/about',
  optIn: 'https://play.google.com/apps/testing/gg.praetorium',
}
