export function isSearchShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>) {
  return event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)
}
