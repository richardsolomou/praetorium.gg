/**
 * BattleScribe roster interchange: the format New Recruit, BattleScribe and every
 * tournament organiser already reads.
 *
 * The reason this is tractable at all is that both sides read the same community
 * catalogues, so a list exported by another tool references the very entry ids this
 * one indexes. Matching by id is exact; matching by name is the fallback for the
 * cases where it is not.
 *
 * Pure: turning a string into a tree and back. Zipping lives in the server layer.
 */

import type { CatalogueIndex } from './catalogue'
import type { Selection } from './evaluate'

/** What a `.ros` file says, reduced to what can be rebuilt from it. */
export type ParsedRoster = {
  name: string
  /** The catalogue the force was built from, when the file names one. */
  catalogueId: string | null
  catalogueName: string | null
  selections: Selection[]
  /** Entries the file referenced that this instance's catalogue does not have. */
  unknown: string[]
}

type XmlNode = Record<string, unknown>

const ROSTER_NS = 'http://www.battlescribe.net/schema/rosterSchema'

/**
 * A `.ros` document for a built roster.
 *
 * Written rather than round-tripped, because what is stored is the selections and
 * the revision, not the file somebody imported.
 */
export function toRosterXml(
  roster: { name: string; catalogueId: string; selections: readonly Selection[] },
  index: CatalogueIndex,
  points: number,
): string {
  const catalogue = index.catalogues.get(roster.catalogueId)
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<roster xmlns="${ROSTER_NS}" id="${id(roster.name)}" name="${escape(roster.name)}" battleScribeVersion="2.03"` +
      ` gameSystemId="${escape(gameSystemId(index))}" gameSystemName="Warhammer 40,000" gameSystemRevision="1">`,
    '  <costs>',
    `    <cost name="pts" typeId="${escape(index.pointsTypeId)}" value="${points}"/>`,
    '  </costs>',
    '  <forces>',
    `    <force id="${id(`${roster.name}-force`)}" name="Army Roster" entryId="force"` +
      ` catalogueId="${escape(roster.catalogueId)}" catalogueName="${escape(catalogue?.name ?? '')}">`,
    '      <selections>',
    ...roster.selections.flatMap((selection) => selectionXml(selection, index, 4)),
    '      </selections>',
    '    </force>',
    '  </forces>',
    '</roster>',
  ]
  return lines.join('\n')
}

function selectionXml(selection: Selection, index: CatalogueIndex, depth: number): string[] {
  const pad = '  '.repeat(depth)
  const definition = index.definitions.get(selection.id)
  const target = definition && 'targetId' in definition ? index.definitions.get(definition.targetId) : definition
  const name = target?.name ?? selection.id
  const count = selection.count ?? 1
  const cost = target?.costs?.find((entry) => entry.typeId === index.pointsTypeId)?.value ?? 0
  const type = target?.type ?? 'upgrade'

  const children = (selection.selections ?? []).flatMap((child) => selectionXml(child, index, depth + 2))
  const head =
    `${pad}<selection id="${id(`${selection.id}-${count}`)}" name="${escape(name)}" entryId="${escape(selection.id)}"` +
    ` number="${count}" type="${escape(type)}">`

  return [
    head,
    `${pad}  <costs><cost name="pts" typeId="${escape(index.pointsTypeId)}" value="${cost * count}"/></costs>`,
    ...(children.length ? [`${pad}  <selections>`, ...children, `${pad}  </selections>`] : []),
    `${pad}</selection>`,
  ]
}

/**
 * Reads a `.ros` document into selections this instance can price.
 *
 * An entry id from another tool may be a path of link ids joined by `::`; the last
 * segment is the entry itself. Anything still unrecognised is reported rather than
 * dropped silently — an import that quietly loses half a list is worse than one that
 * says what it could not place.
 */
export function fromRosterXml(xml: string, index: CatalogueIndex, parse: (input: string) => XmlNode): ParsedRoster {
  const document = parse(xml)
  const roster = asNode(document.roster)
  const force = asNode(asNode(roster?.forces)?.force)
  const unknown: string[] = []

  const selections = list(asNode(force?.selections)?.selection).flatMap((entry) => read(entry, index, unknown))

  return {
    name: text(roster?.['@_name']) ?? 'Imported list',
    catalogueId: text(force?.['@_catalogueId']),
    catalogueName: text(force?.['@_catalogueName']),
    selections,
    unknown: [...new Set(unknown)],
  }
}

function read(node: XmlNode, index: CatalogueIndex, unknown: string[]): Selection[] {
  const raw = text(node['@_entryId'])
  const name = text(node['@_name'])
  const resolved = resolve(raw, name, index)
  const children = list(asNode(node.selections)?.selection).flatMap((child) => read(child, index, unknown))

  if (!resolved) {
    if (name) unknown.push(name)
    // A parent this instance cannot place still has children it might: they are
    // lifted rather than lost with it.
    return children
  }

  const count = Number(text(node['@_number']) ?? '1')
  return [{ id: resolved, count: Number.isFinite(count) && count > 0 ? count : 1, ...(children.length ? { selections: children } : {}) }]
}

function resolve(entryId: string | null, name: string | null, index: CatalogueIndex): string | null {
  for (const candidate of entryId ? [entryId, ...entryId.split('::').toReversed()] : []) {
    if (index.definitions.has(candidate)) return candidate
  }
  // Falling back to the name catches a file whose ids come from another edition.
  const byName = name ? index.unitsByName.get(name) : undefined
  return byName?.[0]?.id ?? null
}

/** An XML element, or nothing when the parser gave text or a list instead. */
function asNode(value: unknown): XmlNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return Object.fromEntries(Object.entries(value))
}

const list = (value: unknown): XmlNode[] =>
  Array.isArray(value) ? value.filter((entry): entry is XmlNode => Boolean(asNode(entry))) : asNode(value) ? [asNode(value)!] : []

const text = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : typeof value === 'number' ? String(value) : null

const gameSystemId = (index: CatalogueIndex) => [...index.catalogues.keys()][0] ?? ''

/** A stable identifier from a name, since a roster file wants one and nothing reads it back. */
const id = (seed: string) =>
  Array.from(seed)
    .reduce((hash, character) => (hash * 31 + character.codePointAt(0)!) % 0xffffffff, 7)
    .toString(16)
    .padStart(8, '0')

const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
