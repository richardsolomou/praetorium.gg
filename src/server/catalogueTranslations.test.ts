import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { loadCatalogueTranslations } from './catalogueTranslations'

it('names a faction in each language its faction keyword is translated into', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-translations-'))
  fs.mkdirSync(path.join(directory, 'translations'))
  fs.writeFileSync(
    path.join(directory, 'translations', 'es.json'),
    JSON.stringify({ 'Faction: Space Wolves': 'Facción: Lobos espaciales' }),
  )
  fs.writeFileSync(path.join(directory, 'translations', 'fr.json'), JSON.stringify({ 'Faction: Space Wolves': 'Faction : Space Wolves' }))

  expect(loadCatalogueTranslations(directory).get('Space Wolves')).toEqual(['Lobos espaciales'])
  fs.rmSync(directory, { recursive: true })
})
