import fs from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { factionsFor } from '../src/shared/factionReferences'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

it.skipIf(!fs.existsSync(path.join(directory, 'definitions')))(
  'links a detachment defined in a library to the faction that publishes its page',
  () => {
    const loaded = loadCatalogue(directory)!
    const titanicus = factionsFor(loaded, null).factions.find((faction) => faction.name.includes('Titanicus Traitoris'))
    expect(titanicus?.detachments.find((detachment) => detachment.name === 'Blood Legion')?.referenceRoute).toEqual({
      catalogueId: 'chaos-daemons',
      slug: 'blood-legion',
    })
  },
)
