export function isSearchShortcut(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'> & { key?: string }) {
  return event.key?.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)
}

export function searchShortcutModifier(userAgent: string) {
  return /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(userAgent) ? '⌘' : 'Ctrl'
}
