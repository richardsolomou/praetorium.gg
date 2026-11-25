import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { nameOf } from '../src/core/catalogue'
import { snapshotWords } from '../src/server/sourceTexts'
import { rosterCombatant } from '../src/shared/rosterCombatRules'
import { measureRosterUnits } from '../src/shared/rosterGradeMeasures'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

type Pick = { entryId: string; attachedTo?: number }

describe.skipIf(!fs.existsSync(directory))('roster grade facts read from the catalogue', () => {
  let snapshot: ReturnType<typeof loadSnapshotWithRules>
  let words: ReturnType<typeof snapshotWords>
  let catalogueId: string

  beforeAll(() => {
    snapshot = loadSnapshotWithRules(directory)
    words = snapshotWords(directory)
    catalogueId = snapshot.catalogue.factions.find((faction) => faction.name.endsWith('Tyranids'))!.id
  }, 180_000)

  const entry = (name: string) =>
    [...snapshot.catalogue.index.datasheets.get(catalogueId)!].find(
      (id) => nameOf(snapshot.catalogue.index.definitions.get(id)!, snapshot.catalogue.index.definitions) === name,
    )!
  // With no reference units there is nothing to simulate, which leaves the facts read from the units' own rules.
  const measured = (units: Pick[]) =>
    measureRosterUnits({
      loaded: snapshot.catalogue,
      rules: snapshot.rules,
      words,
      data: { catalogueId, detachmentIds: [], disposition: null, limit: 500, units },
      references: { targets: {}, attackers: [] },
      calculate: async () => [],
    })
  const primeLeading = () => [{ entryId: entry('Tyranid Prime with Lash Whip'), attachedTo: 1 }, { entryId: entry('Hormagaunts') }]

  it('reads Biovores’ Spore Mines as a shooting-triggered unit shared across the army', async () => {
    const [biovores] = await measured([{ entryId: entry('Biovores') }])
    expect(biovores?.unitGeneration).toEqual([{ unit: 'Spore Mines', trigger: 'shooting', shared: true }])
  })

  it('reads the Parasite of Mortrex’s Ripper Swarms as needing a kill', async () => {
    const [parasite] = await measured([{ entryId: entry('Parasite of Mortrex') }])
    expect(parasite?.unitGeneration).toEqual([{ unit: 'Ripper Swarms', trigger: 'kill', shared: false }])
  })

  it('gathers the movement tools of a leader and the unit it leads', async () => {
    const [unit] = await measured(primeLeading())
    expect(unit?.movementTools).toEqual(['Advance and charge', 'Up to D6″ surge after enemy shooting destroys a model'])
  })

  it.each([
    { led: true, keywords: 'Sustained Hits 1' },
    { led: false, keywords: undefined },
  ])('gives Hormagaunt talons Sustained Hits 1 only while a Prime leads them: led $led', ({ led, keywords }) => {
    const picks = led ? primeLeading() : primeLeading().map(({ entryId }) => ({ entryId }))
    const projection = rosterCombatant(snapshot.catalogue, snapshot.rules, {
      catalogueId,
      detachmentIds: [],
      picks: picks.map((pick) => ({ catalogueId, ...pick })),
      pickIndex: 1,
    })!
    const talons = projection.selected.profiles.find((profile) => profile.name === 'Hormagaunt talons')!
    expect(talons.values.find((value) => value.name === 'Keywords')?.value).toBe(keywords)
  })
})
