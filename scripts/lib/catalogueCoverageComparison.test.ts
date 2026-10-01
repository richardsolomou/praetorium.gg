import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compareCatalogueCoverage } from './catalogueCoverageComparison'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('catalogue coverage comparison', () => {
  it('keeps unrelated losses visible while a new book replaces its parent and importing chapters', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-replacement-coverage-'))
    temporaryDirectories.push(root)
    const catalogue = path.join(root, 'catalogue')
    const definitions = path.join(catalogue, 'definitions')
    const rules = path.join(catalogue, 'rules')
    fs.mkdirSync(definitions, { recursive: true })
    fs.mkdirSync(path.join(catalogue, 'datacards', '11th', 'gdc'), { recursive: true })
    fs.mkdirSync(path.join(rules, 'data', 'core'), { recursive: true })
    for (const book of [
      { id: 'legacy', name: 'Example Army' },
      { id: 'current', name: 'Example Army (11e)' },
      { id: 'chapter', name: 'Example Chapter', catalogueLinks: [{ targetId: 'legacy', importRootEntries: true }] },
      { id: 'unrelated', name: 'Unrelated Army' },
    ])
      fs.writeFileSync(path.join(definitions, `${book.id}.json`), JSON.stringify({ catalogue: book }))
    const faction = (name: string, rule: string) => ({
      name,
      slug: name.toLowerCase().replaceAll(' ', '-'),
      armyRules: rule ? [rule] : [],
      detachments: [],
      datasheets: [],
    })
    const base = path.join(root, 'base.json')
    const head = path.join(root, 'head.json')
    fs.writeFileSync(
      base,
      JSON.stringify([
        faction('Example Army', 'Old Parent Rule'),
        faction('Example Chapter', 'Chapter Rule'),
        faction('Unrelated Army', 'Other Rule'),
      ]),
    )
    fs.writeFileSync(
      head,
      JSON.stringify([faction('Example Army (11e)', 'New Parent Rule'), faction('Example Chapter', ''), faction('Unrelated Army', '')]),
    )

    expect(compareCatalogueCoverage(base, head, [], catalogue, rules, 'Example Army (11e)').lost).toEqual([
      'unrelated-army army rules: Other Rule',
    ])
  })

  it.each([
    { scenario: 'keeps a newly priced unit', price: 245, lost: [] },
    {
      scenario: 'reports a unit whose price disappears',
      price: 0,
      lost: ['example-faction / Example Unit: points unavailable', 'example-faction / Example Unit roster: points unavailable'],
    },
  ])('$scenario', ({ price, lost }) => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-points-coverage-'))
    temporaryDirectories.push(root)
    const catalogue = path.join(root, 'catalogue')
    const rules = path.join(catalogue, 'rules')
    fs.mkdirSync(path.join(catalogue, 'datacards', '11th', 'gdc'), { recursive: true })
    fs.mkdirSync(path.join(rules, 'data', 'core'), { recursive: true })
    const snapshot = (points: number) => [
      {
        name: 'Example Faction',
        slug: 'example-faction',
        armyRules: [],
        detachments: [],
        datasheets: [
          {
            name: 'Example Unit',
            points,
            profiles: [],
            abilities: [],
            keywordRules: [],
            attachments: [],
            leaders: [],
            composition: 0,
            wargearOptions: 0,
            loadout: false,
            baseSize: false,
            roster: { points, models: [], wargear: [], choices: [], errors: [], deployment: [] },
          },
        ],
      },
    ]
    const base = path.join(root, 'base.json')
    const head = path.join(root, 'head.json')
    fs.writeFileSync(base, JSON.stringify(snapshot(100)))
    fs.writeFileSync(head, JSON.stringify(snapshot(price)))

    expect(compareCatalogueCoverage(base, head, [], catalogue, rules).lost).toEqual(lost)
  })

  it.each([
    {
      scenario: 'keeps a weapon when differently capitalized copies are combined',
      before: ['Melee Weapons: Example Blade', 'Melee Weapons: Example blade'],
      after: ['Melee Weapons: Example blade'],
      lost: [],
    },
    {
      scenario: 'reports a removed weapon even when another weapon remains',
      before: ['Melee Weapons: Example blade', 'Melee Weapons: Other blade'],
      after: ['Melee Weapons: Other blade'],
      lost: ['example-faction / Example Unit profiles: Melee Weapons: Example blade'],
    },
    {
      scenario: 'reports a removed weapon mode even when its other mode remains',
      before: ['Melee Weapons: Example blade - strike', 'Melee Weapons: Example blade - sweep'],
      after: ['Melee Weapons: Example blade - sweep'],
      lost: ['example-faction / Example Unit profiles: Melee Weapons: Example blade - strike'],
    },
  ])('$scenario', ({ before, after, lost }) => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-profile-coverage-'))
    temporaryDirectories.push(root)
    const catalogue = path.join(root, 'catalogue')
    const rules = path.join(catalogue, 'rules')
    fs.mkdirSync(path.join(catalogue, 'datacards', '11th', 'gdc'), { recursive: true })
    fs.mkdirSync(path.join(rules, 'data', 'core'), { recursive: true })
    const snapshot = (profiles: string[]) => [
      {
        name: 'Example Faction',
        slug: 'example-faction',
        armyRules: [],
        detachments: [],
        datasheets: [
          {
            name: 'Example Unit',
            points: 100,
            profiles,
            abilities: [],
            keywordRules: [],
            attachments: [],
            leaders: [],
            keywords: 0,
            composition: 0,
            wargearOptions: 0,
            loadout: false,
            baseSize: false,
            roster: null,
          },
        ],
      },
    ]
    const base = path.join(root, 'base.json')
    const head = path.join(root, 'head.json')
    fs.writeFileSync(base, JSON.stringify(snapshot(before)))
    fs.writeFileSync(head, JSON.stringify(snapshot(after)))

    expect(compareCatalogueCoverage(base, head, [], catalogue, rules).lost).toEqual(lost)
  })

  it('reports a field removed from the head snapshot', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-coverage-comparison-'))
    temporaryDirectories.push(root)
    const catalogue = path.join(root, 'catalogue')
    const rules = path.join(catalogue, 'rules')
    fs.mkdirSync(path.join(catalogue, 'datacards', '11th', 'gdc'), { recursive: true })
    fs.mkdirSync(path.join(rules, 'data', 'core'), { recursive: true })
    fs.writeFileSync(
      path.join(catalogue, 'datacards', '11th', 'gdc', 'faction.json'),
      JSON.stringify({ name: 'Example Faction', detachments: [] }),
    )
    const base = path.join(root, 'base.json')
    const head = path.join(root, 'head.json')
    const faction = {
      name: 'Example Faction',
      slug: 'example-faction',
      armyRules: ['Example Rule'],
      detachments: [],
      datasheets: [],
    }
    fs.writeFileSync(base, JSON.stringify([faction]))
    fs.writeFileSync(head, JSON.stringify([{ ...faction, armyRules: [] }]))

    const compared = compareCatalogueCoverage(base, head, [], catalogue, rules)

    expect(compared.lost).toEqual(['example-faction army rules: Example Rule'])
  })

  it('keeps a stratagem when its source changes punctuation', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-stratagem-coverage-'))
    temporaryDirectories.push(root)
    const catalogue = path.join(root, 'catalogue')
    const rules = path.join(catalogue, 'rules')
    const datacards = path.join(catalogue, 'datacards', '11th', 'gdc')
    fs.mkdirSync(datacards, { recursive: true })
    fs.mkdirSync(path.join(rules, 'data', 'core'), { recursive: true })
    fs.writeFileSync(path.join(datacards, 'faction.json'), JSON.stringify({ name: 'Example Faction', detachments: [] }))
    const snapshot = (name: string) => [
      {
        name: 'Example Faction',
        slug: 'example-faction',
        armyRules: [],
        detachments: [
          {
            name: 'Example Detachment',
            rules: [],
            enhancements: [],
            upgrades: [],
            stratagems: [{ name, described: true }],
          },
        ],
        datasheets: [],
      },
    ]
    const base = path.join(root, 'base.json')
    const head = path.join(root, 'head.json')
    fs.writeFileSync(base, JSON.stringify(snapshot('Coordinated Strike')))
    fs.writeFileSync(head, JSON.stringify(snapshot('Co-ordinated Strike')))

    expect(compareCatalogueCoverage(base, head, [], catalogue, rules).lost).toEqual([])
  })
})
