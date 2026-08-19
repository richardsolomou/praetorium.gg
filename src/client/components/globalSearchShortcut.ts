export function isSearchShortcut(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'> & { key?: string }) {
  return event.key?.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)
}
