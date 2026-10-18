import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  listForgeDetailed,
  listForgeWtc,
  listForgeAllies,
  listForgePiranhas,
  listForgeWtcKeyword,
  warmind,
  warmindListForge,
  warmindWtc,
  warmindOfficial,
} from '../src/core/rosterText.fixtures'
import type { LoadedCatalogue } from '../src/server/catalogueIndex'
import type { LoadedRules } from '../src/shared/rules'
import { calculateRosterPrice } from '../src/shared/pricing'
import { importRosterFile } from '../src/shared/rosterFiles'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const source = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(source))('genuine exports from other army builders', () => {
  let catalogue: LoadedCatalogue
  let rules: LoadedRules | null
  beforeAll(() => {
    ;({ catalogue, rules } = loadSnapshot(path.resolve(source)))
  })
  const imported = (file: string) => importRosterFile({ file }, catalogue, undefined, rules)
  const summary = (file: string) => {
    const result = imported(file)
    return {
      format: result.format,
      faction: result.catalogueName,
      detachments: result.detachmentIds.length,
      units: `${result.units.length} of ${result.sourceUnitCount}`,
      attached: result.units.filter((unit) => unit.attachedTo !== undefined).length,
      mismatches: [...result.unknown, ...result.unplaced],
      points: `${result.currentPoints} for ${result.reportedPoints}`,
    }
  }

  it.each([
    ['listForgeDetailed', listForgeDetailed, 'listforge', 'Xenos - Drukhari', 2, '6 of 6', 2, '510 for 510'],
    ['listForgeWtc', listForgeWtc, 'listforge-wtc', 'Xenos - Drukhari', 2, '6 of 6', 2, '510 for 510'],
    ['listForgeAllies', listForgeAllies, 'listforge', 'Imperium - Grey Knights', 1, '2 of 2', 0, '285 for 285'],
    ['listForgePiranhas', listForgePiranhas, 'listforge', "Xenos - T'au Empire", 2, '1 of 1', 0, '65 for 65'],
    ['listForgeWtcKeyword', listForgeWtcKeyword, 'listforge-wtc', 'Chaos - Chaos Daemons', 1, '2 of 2', 0, '685 for 685'],
    ['warmind', warmind, 'warmind', 'Xenos - Drukhari', 2, '6 of 6', 2, '510 for 510'],
    // Warmind's ListForge and tournament texts do not say who leads whom.
    ['warmindListForge', warmindListForge, 'listforge', 'Xenos - Drukhari', 2, '4 of 4', 0, '350 for 350'],
    ['warmindWtc', warmindWtc, 'wtc', 'Xenos - Drukhari', 2, '4 of 4', 0, '350 for 350'],
    ['warmindOfficial', warmindOfficial, 'roster-file', 'Xenos - Drukhari', 2, '4 of 4', 1, '350 for 350'],
  ] as const)(
    'imports %s with every unit, detachment and attachment',
    (_name, file, format, faction, detachments, units, attached, points) => {
      expect(summary(file)).toEqual({ format, faction, detachments, units, attached, mismatches: [], points })
    },
  )

  const wargear = (file: string, unit: string) => {
    const result = imported(file)
    const priced = calculateRosterPrice(
      { catalogueId: result.catalogueId!, detachmentIds: result.detachmentIds, disposition: null, limit: 2000, units: result.units },
      catalogue,
      rules,
    )
    const held = priced?.units.find((candidate) => candidate.name === unit)?.wargear ?? []
    return held.map((piece) => `${piece.count}x ${piece.name.toLowerCase()}`)
  }

  // Depends on #1149: a stated choice the selection tree cannot hold is neither kept nor reported.
  it.fails("keeps a Hekatrix's stated pistol", () => {
    expect(wargear(listForgeDetailed, 'Wyches')).toContain('1x blast pistol')
  })

  // Depends on #1149.
  it.fails("keeps both of a Piranha's stated seeker missiles", () => {
    expect(wargear(listForgePiranhas, 'Piranhas')).toContain('2x seeker missile')
  })
})
