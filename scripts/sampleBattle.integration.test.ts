import fs from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'
import { reduceBattle } from '../src/core/battle'
import { battleFoldArgs } from '../src/core/offlineBattle'
import { sampleBattleHistory } from '../src/server/sampleBattle'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

// A data update that renames a unit, card or stratagem the scripted game plays would otherwise break the page in production.
it.skipIf(!fs.existsSync(directory))(
  'plays the sample battle to its finish on the synced data',
  async () => {
    const { catalogue, rules } = loadSnapshotWithRules(path.resolve(directory))
    const history = await sampleBattleHistory(rules, async () => catalogue)
    expect(reduceBattle(...battleFoldArgs(history.players, history.log)).result?.reason).toBe('completed')
  },
  60_000,
)
