import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { loadCatalogueTranslations } from './catalogueTranslations'
import composition from '../../catalogue/composition.json' with { type: 'json' }
import type { VsDataSummariesFile } from '../shared/vsData'

it('names a faction in each language its faction keyword is translated into', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-translations-'))
  fs.mkdirSync(path.join(directory, 'translations', 'data'), { recursive: true })
  fs.writeFileSync(
    path.join(directory, 'translations', 'data', 'es.json'),
    JSON.stringify({ 'Faction: Space Wolves': 'Facción: Lobos espaciales' }),
  )
  fs.writeFileSync(
    path.join(directory, 'translations', 'data', 'fr.json'),
    JSON.stringify({ 'Faction: Space Wolves': 'Faction : Space Wolves' }),
  )

  expect(loadCatalogueTranslations(directory).get('Space Wolves')).toEqual(['Lobos espaciales'])
  fs.rmSync(directory, { recursive: true })
})

it('names a faction by every spelling the official app gives it, under each name a catalogue can have', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-translations-'))
  const base = composition.editions.find((entry) => entry.base)!
  fs.writeFileSync(path.join(directory, 'composition.json'), JSON.stringify({ ...composition, editions: [base] }))
  const release: VsDataSummariesFile = {
    release: '0.1.0',
    rulesVersion: { edition: '11th', update: base.edition.name },
    entries: {},
    attributions: [],
    stratagems: [],
    missionPacks: [],
    missionActions: [],
    terrain: [],
    detachments: [],
    units: {},
    factions: {},
    keywords: {},
    coreRules: [],
    records: [],
    names: {
      factions: [['Adeptus Astartes', 'Space Marines', '阿斯塔特修会']],
      detachments: {},
      enhancements: [],
      dispositions: [],
      units: {},
    },
  }
  fs.mkdirSync(path.join(directory, 'summaries'))
  fs.writeFileSync(path.join(directory, 'summaries', `${base.edition.id}.json`), JSON.stringify(release))

  expect(loadCatalogueTranslations(directory).get('Space Marines')).toEqual(['Adeptus Astartes', '阿斯塔特修会'])
  fs.rmSync(directory, { recursive: true })
})
