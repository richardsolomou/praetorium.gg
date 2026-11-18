export function absoluteAgentLinks<T>(value: T, origin: string): T {
  if (Array.isArray(value)) return value.map((entry) => absoluteAgentLinks(entry, origin)) as T
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      (key === 'url' || key.endsWith('Url')) && typeof entry === 'string' && entry.startsWith('/') && !entry.startsWith('//')
        ? new URL(entry, origin).href
        : absoluteAgentLinks(entry, origin),
    ]),
  ) as T
}

/** JSON text rewritten by `transform`, keeping its indentation; text that is not JSON goes to `otherwise`. */
export function rewriteJsonText(text: string, transform: (value: unknown) => unknown, otherwise: (text: string) => string) {
  try {
    return JSON.stringify(transform(JSON.parse(text)), null, text.startsWith('{\n  ') || text.startsWith('[\n  ') ? 2 : undefined)
  } catch {
    return otherwise(text)
  }
}

export function absoluteAgentText(text: string, origin: string) {
  return rewriteJsonText(
    text,
    (value) => absoluteAgentLinks(value, origin),
    (plain) =>
      plain.replace(/^(Canonical URL: )(\/[^\s]*)$/gm, (_match, label: string, path: string) => `${label}${new URL(path, origin).href}`),
  )
}
