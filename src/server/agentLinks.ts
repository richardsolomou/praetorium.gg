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

export function absoluteAgentText(text: string, origin: string) {
  try {
    return JSON.stringify(
      absoluteAgentLinks(JSON.parse(text), origin),
      null,
      text.startsWith('{\n  ') || text.startsWith('[\n  ') ? 2 : undefined,
    )
  } catch {
    return text.replace(/^(Canonical URL: )(\/[^\s]*)$/gm, (_match, label: string, path: string) => `${label}${new URL(path, origin).href}`)
  }
}
