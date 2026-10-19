import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { referenceFactionId } from '../src/core/factionReferenceRoute'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { publishedDetachmentReference } from '../src/server/referenceCatalogue'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(directory))('Marine detachment reference ownership', () => {
  let versions: ReturnType<typeof catalogueEditionLoaders>

  beforeAll(() => {
    const { catalogue, rules } = loadSnapshotWithRules(directory)
    versions = catalogueEditionLoaders(
      directory,
      () => catalogue,
      () => rules,
    )
    versions.factions()
  }, 60_000)

  const references = (faction: NonNullable<ReturnType<typeof versions.factionFor>>) =>
    faction.detachments.filter((detachment) => faction.referenceDetachmentIds.includes(detachment.id))

  it.each([
    ['imperial-fists', 'Ceramite Sentinels'],
    ['iron-hands', "Medusa's Wrath"],
    ['raven-guard', 'Shadowmark Talon'],
    ['salamanders', "Forgefather's Seekers"],
    ['ultramarines', 'Blade of Ultramar'],
    ['white-scars', 'Spearpoint Task Force'],
  ])('%s publishes only its own detachment', (chapter, name) => {
    expect(references(versions.factionFor(chapter)!).map((detachment) => detachment.name)).toEqual([name])
  })

  it.each([
    ['black-templars', 3],
    ['blood-angels', 3],
    ['dark-angels', 3],
    ['deathwatch', 1],
    ['space-wolves', 3],
  ])('%s publishes its complete chapter reference', (chapter, count) => {
    const detachments = references(versions.factionFor(chapter)!)
    expect({
      count: detachments.length,
      generic: detachments.filter(({ name }) => ['Gladius Task Force', "Forgefather's Seekers"].includes(name)),
    }).toEqual({ count, generic: [] })
  })

  it.each([
    'space-marines-codex-2026-10-03',
    'space-marines-codex-2026-10-12',
    'space-marines-codex-2026-10-13',
    'space-marines-points-2026-10-13',
    'mfm-1-6',
  ])('keeps parent and chapter references separate under %s', (version) => {
    const factions = versions.factions()!.factions
    for (const [chapter, name, absent] of [
      ['salamanders', "Forgefather's Seekers", 'Gladius Task Force'],
      ['space-marines', 'Gladius Task Force', "Forgefather's Seekers"],
    ]) {
      const id = referenceFactionId(factions, chapter!, version)!
      const faction = versions.factionFor(id)!
      const offered = references(faction)
      const detachment = offered.find((candidate) => candidate.name === name)!
      expect(offered.map((candidate) => candidate.name)).not.toContain(absent)
      expect(detachment.referenceRoute).toEqual({ catalogueId: faction.slug, slug: detachment.slug })
      expect(publishedDetachmentReference(versions.catalogueFor(id)!, versions.rulesFor(id)!, id, detachment.slug)?.name).toBe(name)
    }
  })
})
