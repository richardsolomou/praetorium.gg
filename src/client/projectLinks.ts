/** The repository, which is the product's other front door. */
export const SOURCE = 'https://github.com/richardsolomou/praetorium.gg'

export const NEW_ISSUE = `${SOURCE}/issues/new`

export const SPONSOR = 'https://github.com/sponsors/richardsolomou'

export const DISCORD = 'https://discord.gg/RFUMZNFwMu'

export const PRIVACY_EMAIL = 'privacy@praetorium.gg'

export const APP_STORE_ID = '6806875244'

/** Without a country code, so the App Store opens in the visitor's own storefront. */
export const APP_STORE = `https://apps.apple.com/app/praetorium-gg/id${APP_STORE_ID}`

/**
 * The Google Group whose members may opt in to the Android closed test; its page links to the opt-in. Unset it to
 * hide the Google Play badge.
 */
export const ANDROID_BETA: string | undefined = 'https://groups.google.com/g/praetorium-android-beta'
