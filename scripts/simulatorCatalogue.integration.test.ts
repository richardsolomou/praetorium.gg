import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { calculateCombat, DEFAULT_COMBAT_OPTIONS, type CombatOptions } from '../src/core/combat'
import { combatAttacks } from '../src/core/combatScenario'
import { combatUnitTarget } from '../src/core/combatUnit'
import { combatUnitsFor } from '../src/shared/combatUnits'
import { combatLoadoutCandidates, EXHAUSTIVE_STATES } from '../src/shared/combatLoadouts'
import { rosterCombatant } from '../src/shared/rosterCombatRules'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(directory))('simulator catalogue projections', () => {
  let snapshot: ReturnType<typeof loadSnapshotWithRules>
  let index: ReturnType<typeof combatUnitsFor>

  // About 15 seconds alone, but CI runs it beside every other integration suite on a shared runner.
  beforeAll(() => {
    snapshot = loadSnapshotWithRules(directory)
    index = combatUnitsFor(snapshot.catalogue, snapshot.rules)
  }, 180_000)

  const unit = (faction: string, name: string) => {
    const book = index.find((candidate) => candidate.name === faction)!
    const entry = book.units.find((candidate) => candidate.name === name)!
    const projected = rosterCombatant(snapshot.catalogue, snapshot.rules, {
      catalogueId: book.catalogueId,
      detachmentIds: [],
      picks: [{ entryId: entry.id }],
      pickIndex: 0,
    })!
    return { sheet: projected.selected, carriers: projected.carriers, models: projected.models }
  }
  const attacks = (attacker: ReturnType<typeof unit>, preferences: Record<string, string> = {}) =>
    combatAttacks(attacker, { keywords: [], rules: [] }, preferences, { ranged: [], melee: [] })
  const damage = (attack: ReturnType<typeof attacks>[CombatOptions['phase']], phase: CombatOptions['phase']) =>
    calculateCombat({
      ...attack.base!,
      target: combatUnitTarget(unit('Space Marines', 'Intercessor Squad')).target!,
      options: { ...DEFAULT_COMBAT_OPTIONS, phase },
    }).meanDamage

  it.each([
    ['Blood Angels', 'Lemartes', 'ranged'],
    ['Chaos Daemons', 'Pink Horrors', 'ranged'],
    ['Astra Militarum', 'Cadian Heavy Weapons Squad', 'melee'],
    ['Aeldari', 'Jain Zar', 'melee'],
    ['Drukhari', 'Lady Malys', 'melee'],
    ['Orks', 'Deffkoptas', 'ranged'],
  ] as const)('%s %s calculates its %s source-linked equipment', (faction, name, phase) => {
    const attack = attacks(unit(faction, name))[phase]
    expect(attack.plan.errors).toEqual([])
    expect(damage(attack, phase)).toBeGreaterThan(0)
  })

  it.each(['strike', 'sweep'])('Defiler calculates its Shearing claws %s profile', (mode) => {
    const defiler = unit('Death Guard', 'Defiler')
    const choice = attacks(defiler).melee.plan.choices.find((candidate) => candidate.label === 'Defiler · Shearing claws')!
    const option = choice.options.find((candidate) => candidate.label === `Shearing claws - ${mode}`)!
    const attack = attacks(defiler, { [choice.key]: option.value }).melee
    expect(attack.plan.active.map(({ profile }) => profile.name)).toEqual([`Shearing claws - ${mode}`])
    expect(damage(attack, 'melee')).toBeGreaterThan(0)
  })

  it.each([
    ['Death Guard', 'Plague Marines', 10, true],
    ['Orks', 'Boyz', 10, false],
  ] as const)('%s %s ×%i searches only near the requested loadout: %s', async (faction, name, models, local) => {
    const book = index.find((candidate) => candidate.name === faction)!
    const entry = book.units.find((candidate) => candidate.name === name)!
    const data = { catalogueId: book.catalogueId, detachmentIds: [], picks: [{ entryId: entry.id, models }], pickIndex: 0 }
    const batches = []
    for await (const batch of combatLoadoutCandidates(snapshot.catalogue, data, new AbortController().signal, snapshot.rules))
      batches.push(batch)
    expect({
      local: batches.every((batch) => batch.local),
      beyondBound: batches[0]!.estimated > EXHAUSTIVE_STATES,
    }).toEqual({ local, beyondBound: local })
  })

  describe('a Loyal Protector joined to a Command Squad leading Cadian Shock Troops', () => {
    const roster = () => {
      const book = index.find((candidate) => candidate.name === 'Astra Militarum')!
      const id = (name: string) => book.units.find((candidate) => candidate.name === name)!.id
      return {
        catalogueId: book.catalogueId,
        detachmentIds: [],
        picks: [
          { entryId: id('Cadian Shock Troops') },
          { entryId: id('Cadian Command Squad'), attachedTo: 0 },
          { entryId: id('Nork Deddog'), attachedTo: 1 },
        ],
      }
    }
    const members = (pickIndex: number) => {
      const projected = rosterCombatant(snapshot.catalogue, snapshot.rules, { ...roster(), pickIndex })!
      return [projected.selected, ...projected.companions.map((member) => member.selected)].map((sheet) => sheet.name).sort()
    }

    it.each([0, 2])('simulates all three from position %i as one unit', (pickIndex) => {
      expect(members(pickIndex)).toEqual(['Cadian Command Squad', 'Cadian Shock Troops', 'Nork Deddog'])
    })

    it('gives Feel No Pain 4+ to the Cadian Commander alone while Nork stands', () => {
      const projected = rosterCombatant(snapshot.catalogue, snapshot.rules, { ...roster(), pickIndex: 0 })!
      const groups = combatUnitTarget({
        sheet: projected.selected,
        carriers: projected.carriers,
        models: projected.models,
        companions: projected.companions.map((member) => ({ sheet: member.selected, carriers: member.carriers, models: member.models })),
      }).target!.groups
      expect(
        groups.flatMap((group) =>
          group.feelNoPainSources?.length ? [[group.unit, group.models, group.wounds, group.feelNoPainSources]] : [],
        ),
      ).toEqual([['Cadian Command Squad', 1, 3, [{ unit: 'Nork Deddog', value: 4 }]]])
    })

    it('counts Ogryn Bodyguard as calculated', () => {
      const projected = rosterCombatant(snapshot.catalogue, snapshot.rules, { ...roster(), pickIndex: 2 })!
      expect(projected.rules.find((rule) => rule.name === 'Ogryn Bodyguard')?.included).toBe(true)
    })
  })

  it.each([
    ['Intercessor Squad', ['Space Marines']],
    ['Assault Intercessor Squad', ['Space Marines']],
    ['Impulsor', ['Black Templars', 'Space Marines']],
  ])('lists %s only in its distinct faction contexts', (name, factions) => {
    expect(
      index
        .filter((book) => book.units.some((entry) => entry.name === name))
        .map((book) => book.name)
        .sort(),
    ).toEqual(factions)
  })
})
