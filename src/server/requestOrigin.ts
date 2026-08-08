export function forwardedOrigin(request: Request) {
  const host = firstHeaderValue(request.headers.get('x-forwarded-host')) ?? request.headers.get('host')?.trim()
  const protocol = firstHeaderValue(request.headers.get('x-forwarded-proto'))
  if (!host || (protocol !== 'http' && protocol !== 'https')) return undefined
  return parseOrigin(`${protocol}://${host}`)
}

export function parseOrigin(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

const firstHeaderValue = (value: string | null) => value?.split(',')[0]?.trim() || undefined
