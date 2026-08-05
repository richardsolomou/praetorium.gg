import { XMLParser } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { fromRosterXml, toRosterXml } from './rosz'

const PTS = 'cost-pts'
const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false })
function parse(input: string): Record<string, unknown> {
  const parsed: Record<string, unknown> = parser.parse(input)
  return parsed
}

const catalogue: Partial<Catalogue> = {
  sharedSelectionEntries: [
    {
      id: 'squad',
      name: 'Plague Marines',
      type: 'unit',
      costs: [{ name: 'pts', typeId: PTS, value: 90 }],
      selectionEntries: [{ id: 'trooper', name: 'Plague Marine', type: 'model' }],
    },
    { id: 'lord', name: 'Lord of Virulence', type: 'model', costs: [{ name: 'pts', typeId: PTS, value: 100 }] },
  ],
}

const index = buildIndex([system, { catalogue: { id: 'cat', name: 'Chaos - Death Guard', ...catalogue } }], 'rev')

const roster = {
  name: "Death Guard — Death Lord's Chosen",
  catalogueId: 'cat',
  selections: [
    { id: 'squad', count: 1, selections: [{ id: 'trooper', count: 5 }] },
    { id: 'lord', count: 1 },
  ],
}

describe('exporting a roster', () => {
  it('names the list and the book it came from', () => {
    const xml = toRosterXml(roster, index, 190)
    expect(xml).toContain('catalogueName="Chaos - Death Guard"')
  })

  it('escapes a name that would otherwise break the document', () => {
    const xml = toRosterXml({ ...roster, name: 'Bob & "Co" <x>' }, index, 0)
    expect(xml).toContain('name="Bob &amp; &quot;Co&quot; &lt;x&gt;"')
  })

  it('carries the total the caller worked out', () => {
    expect(toRosterXml(roster, index, 190)).toContain('value="190"')
  })

  it('is a document another tool can parse', () => {
    expect(() => parse(toRosterXml(roster, index, 190))).not.toThrow()
  })

  it('writes allied selections as their own force', () => {
    const xml = toRosterXml(
      {
        ...roster,
        forces: [
          { catalogueId: 'cat', selections: [roster.selections[0]] },
          { catalogueId: 'allies', selections: [roster.selections[1]] },
        ],
      },
      index,
      190,
    )

    expect(fromRosterXml(xml, index, parse).forces.map((force) => force.catalogueId)).toEqual(['cat', 'allies'])
  })
})

describe('importing a roster', () => {
  it('round-trips its own export', () => {
    const parsed = fromRosterXml(toRosterXml(roster, index, 190), index, parse)
    expect(parsed.selections).toEqual(roster.selections)
  })

  it('keeps the list name', () => {
    expect(fromRosterXml(toRosterXml(roster, index, 190), index, parse).name).toBe(roster.name)
  })

  it('reads the book the force names', () => {
    expect(fromRosterXml(toRosterXml(roster, index, 190), index, parse).catalogueId).toBe('cat')
  })

  it('keeps selections from every force with their catalogue', () => {
    const xml = `<roster name="Allies"><forces>
      <force catalogueId="cat" catalogueName="Chaos - Death Guard"><selections>
        <selection name="Plague Marines" entryId="squad" number="1" type="unit"/>
      </selections></force>
      <force catalogueId="allies" catalogueName="Allied book"><selections>
        <selection name="Lord of Virulence" entryId="lord" number="1" type="model"/>
      </selections></force>
    </forces></roster>`

    expect(fromRosterXml(xml, index, parse).forces).toEqual([
      { catalogueId: 'cat', catalogueName: 'Chaos - Death Guard', selections: [{ id: 'squad', count: 1 }] },
      { catalogueId: 'allies', catalogueName: 'Allied book', selections: [{ id: 'lord', count: 1 }] },
    ])
  })

  it('resolves an id another tool wrote as a path of links', () => {
    // New Recruit and BattleScribe write `link::link::entry`; the entry is the tail.
    const xml = `<roster name="X"><forces><force catalogueId="cat"><selections>
      <selection name="Lord of Virulence" entryId="aaa::bbb::lord" number="1" type="model"/>
    </selections></force></forces></roster>`
    expect(fromRosterXml(xml, index, parse).selections).toEqual([{ id: 'lord', count: 1 }])
  })

  it('falls back to the name when no id is recognised', () => {
    const xml = `<roster name="X"><forces><force><selections>
      <selection name="Plague Marines" entryId="nothing-like-this" number="1" type="unit"/>
    </selections></force></forces></roster>`
    expect(fromRosterXml(xml, index, parse).selections).toEqual([{ id: 'squad', count: 1 }])
  })

  it('says what it could not place rather than losing it quietly', () => {
    const xml = `<roster name="X"><forces><force><selections>
      <selection name="Thunderhawk" entryId="unknown" number="1" type="unit"/>
    </selections></force></forces></roster>`
    expect(fromRosterXml(xml, index, parse).unknown).toEqual(['Thunderhawk'])
  })

  it('keeps the children of a parent it could not place', () => {
    const xml = `<roster name="X"><forces><force><selections>
      <selection name="Thunderhawk" entryId="unknown" number="1" type="unit"><selections>
        <selection name="Lord of Virulence" entryId="lord" number="1" type="model"/>
      </selections></selection>
    </selections></force></forces></roster>`
    expect(fromRosterXml(xml, index, parse).selections).toEqual([{ id: 'lord', count: 1 }])
  })

  it('reads how many of a thing were taken', () => {
    const xml = `<roster name="X"><forces><force><selections>
      <selection name="Plague Marine" entryId="trooper" number="10" type="model"/>
    </selections></force></forces></roster>`
    expect(fromRosterXml(xml, index, parse).selections[0]?.count).toBe(10)
  })
})
