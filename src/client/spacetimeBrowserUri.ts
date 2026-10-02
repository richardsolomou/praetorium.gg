export function spacetimeBrowserUri(uri: string, browserOrigin: string) {
  return new URL(new URL(uri).pathname, browserOrigin).toString()
}
