// Compiling the reference as an object literal can exhaust the iOS renderer's memory; parsing JSON does not.
export function referenceJsonExpression(json: string) {
  return `JSON.parse(${JSON.stringify(json).replaceAll('<', '\\u003c')})`
}

export function embeddedReferenceJson(html: string): string | null {
  const expression = html.match(/<script>window\.PraetoriumOffline=([^]*?);<\/script>/)?.[1]
  if (!expression) return null
  if (!expression.startsWith('JSON.parse(')) return expression
  try {
    const json: unknown = JSON.parse(expression.slice('JSON.parse('.length, -1))
    return typeof json === 'string' ? json : null
  } catch {
    return null
  }
}
