/** The Android emulator reaches the host's loopback through 10.0.2.2. */
export function mobileAppUrl(publicUrl: string, platform: 'ios' | 'android') {
  if (platform === 'ios') return publicUrl
  const url = new URL(publicUrl)
  url.hostname = '10.0.2.2'
  return url.origin
}
