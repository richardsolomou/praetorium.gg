import { XMLParser } from 'fast-xml-parser'
import { unzipSync, strFromU8 } from 'fflate'

/**
 * Reading roster files. The parsing itself is in `src/core/rosz.ts`; this layer
 * only gets the XML out of whatever was uploaded.
 *
 * `fast-xml-parser` and `fflate` are here because XML and zip are not one-liners
 * and both are well travelled. Nothing else in the app needs either.
 */
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false })

export function parseXml(input: string): Record<string, unknown> {
  const parsed: Record<string, unknown> = parser.parse(input)
  return parsed
}

/**
 * The XML from an upload.
 *
 * A `.rosz` is a zip holding one `.ros`; a `.ros` is the XML itself. The two are
 * told apart by the zip signature rather than by a file name, which an upload may
 * not have.
 */
export function rosterXml(file: string): string {
  const trimmed = file.trimStart()
  if (trimmed.startsWith('<')) return trimmed

  const bytes = Uint8Array.from(atob(file), (character) => character.codePointAt(0) ?? 0)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Response('that is not a roster file', { status: 400 })

  const entries = unzipSync(bytes)
  const name = Object.keys(entries).find((key) => key.toLowerCase().endsWith('.ros')) ?? Object.keys(entries)[0]
  if (!name) throw new Response('that archive holds no roster', { status: 400 })
  const found = entries[name]
  if (!found) throw new Response('that archive holds no roster', { status: 400 })
  return strFromU8(found)
}
