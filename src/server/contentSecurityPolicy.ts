export function contentSecurityPolicy(policy: string, imageOrigins: readonly string[], hosted: boolean): string {
  let updated = policy
  for (const origin of imageOrigins) {
    if (!updated.includes(origin)) updated = updated.replace(/(img-src[^;]*)/, `$1 ${origin}`)
  }
  // SpacetimeDB 2.7 generates binary codecs with Function() in the browser.
  if (hosted) {
    updated = updated.replace(/(script-src[^;]*)/, (directive) =>
      directive.includes("'unsafe-eval'") ? directive : `${directive} 'unsafe-eval'`,
    )
  }
  return updated
}
