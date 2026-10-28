/** Structured roster files the importer cannot read, as `roster_import_failed` reports them. */
export type StructuredRosterFile = 'ros' | 'rosz' | 'regiztry'

/**
 * The structured roster file a pasted text or dropped file name looks like: a file name, BattleScribe's `<roster>`
 * XML, or zip bytes, which are taken as `.rosz` since that is a zipped `.ros`.
 */
export function structuredRosterFile(input: string): StructuredRosterFile | null {
  const extension = /^[^\n]*\.(rosz?|regiztry)$/i.exec(input.trim())?.[1]
  if (extension) return extension.toLowerCase() as StructuredRosterFile
  if (input.startsWith('PK\u0003\u0004')) return 'rosz'
  if (/^\s*(?:<\?xml[^>]*\?>\s*)?<roster[\s>]/i.test(input)) return 'ros'
  return null
}
