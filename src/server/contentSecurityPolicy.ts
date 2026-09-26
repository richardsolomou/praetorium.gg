export function contentSecurityPolicy(policy: string, imageOrigin: string, hosted: boolean): string {
  let updated = policy
  if (!updated.includes(imageOrigin)) updated = updated.replace(/(img-src[^;]*)/, `$1 ${imageOrigin}`)
  // SpacetimeDB 2.7 generates binary codecs with Function() in the browser.
  if (hosted) {
    updated = updated.replace(/(script-src[^;]*)/, (directive) =>
      directive.includes("'unsafe-eval'") ? directive : `${directive} 'unsafe-eval'`,
    )
  }
  return updated
}
