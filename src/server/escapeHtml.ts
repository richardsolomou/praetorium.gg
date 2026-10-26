const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Text safe inside HTML or XML element content and quoted attributes. */
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (character) => ENTITIES[character]!)
