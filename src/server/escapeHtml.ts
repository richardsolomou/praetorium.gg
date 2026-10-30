const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Text safe inside HTML or XML element content and quoted attributes. */
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (character) => ENTITIES[character]!)

const CHARACTERS = Object.fromEntries(Object.entries(ENTITIES).map(([character, entity]) => [entity, character]))

/** The text `escapeHtml` escaped. */
export const unescapeHtml = (text: string) => text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => CHARACTERS[entity]!)
