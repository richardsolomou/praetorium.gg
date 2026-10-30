/** JSON safe to inline in a script element: an escaped `<` cannot close it. */
export function scriptJson(value: unknown) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

// Compiling the reference as an object literal can exhaust the iOS renderer's memory; parsing JSON does not.
export function referenceJsonExpression(json: string) {
  return `JSON.parse(${scriptJson(json)})`
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
