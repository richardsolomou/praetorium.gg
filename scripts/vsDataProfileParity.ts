/**
 * Report-only: every datasheet's stat lines as the catalogue prints them against VS Data's, per rules version. For each
 * datasheet the frozen units map joins to a VS Data unit, each unit and weapon profile is matched to its VS Data stat
 * line (`vsStatLineOf`) or kept on the catalogue's, and each characteristic VS Data prints otherwise is listed. Writes
 * `data-dev/vs-data-profile-parity.json` with datasheet and profile names, and prints counts.
 *
 *   pnpm exec tsx scripts/vsDataProfileParity.ts [catalogue directory] [--version <id>]... [--list]
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { datasheetCharacteristicKind, datasheetProfileKind } from '../src/core/datasheetStructure'
import { editionDirectory, readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { vsProfilesIn } from '../src/server/vsDataPoints'
import { datasheetIn } from '../src/shared/catalogue'
import { datasheetsOf } from '../src/shared/catalogueIndex'
import { vsStatLinesOf } from '../src/shared/vsDataProfiles'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { version: { type: 'string', multiple: true }, list: { type: 'boolean', default: false } },
})
const directory = path.resolve(positionals[0] ?? 'catalogue-data')
const composition = readCatalogueComposition(directory)
if (!composition) throw new Error(`${directory} has no rules versions`)

type Difference = { datasheet: string; profile: string; characteristic: string; catalogue: string; vsData: string }
const report: Record<string, unknown> = {}
for (const entry of composition.editions) {
  if (values.version && !values.version.includes(entry.edition.id)) continue
  const target = editionDirectory(directory, entry)
  const read = loadCatalogue(target, entry.edition, { snapshotDirectory: directory })
  // Every rules version's lines, including those datasheets do not read yet.
  const vsProfiles = read && vsProfilesIn(target, read.index, read.keywords ?? [], entry.edition.id, () => true)
  const loaded = read && vsProfiles ? { ...read, vsProfiles } : null
  if (!loaded) {
    console.log(`${entry.edition.id}: no VS Data stat lines`)
    continue
  }
  const catalogueOnly = { ...loaded, vsProfiles: undefined }
  const counts = { datasheets: 0, joined: 0, unitProfiles: 0, unitMatched: 0, weaponProfiles: 0, weaponMatched: 0, same: 0, different: 0 }
  const unjoined = new Set<string>()
  const unmatched: { datasheet: string; profile: string; type: string }[] = []
  const differences: Difference[] = []
  const byCharacteristic: Record<string, number> = {}
  const seen = new Set<string>()
  for (const catalogue of loaded.index.catalogues.values())
    for (const entryId of datasheetsOf(loaded.index, catalogue.id)) {
      if (seen.has(entryId)) continue
      seen.add(entryId)
      const sheet = datasheetIn(catalogueOnly, catalogue.id, entryId)
      if (!sheet) continue
      counts.datasheets++
      if (!loaded.vsProfiles.units[entryId]) {
        unjoined.add(sheet.name)
        continue
      }
      counts.joined++
      // The catalogue's profiles as printed, which is what the datasheet weighs its VS Data lines against.
      const lines = vsStatLinesOf(
        loaded.vsProfiles,
        entryId,
        sheet.name,
        sheet.profiles.map((profile) => ({
          name: profile.name,
          type: profile.type,
          values: Object.fromEntries(profile.values.map((value) => [datasheetCharacteristicKind(value.name), value.value])),
        })),
      )
      for (const [at, profile] of sheet.profiles.entries()) {
        const kind = datasheetProfileKind(profile.type)
        if (kind !== 'unit' && kind !== 'ranged-weapon' && kind !== 'melee-weapon') continue
        const weapon = kind !== 'unit'
        counts[weapon ? 'weaponProfiles' : 'unitProfiles']++
        const line = lines[at]
        if (!line) {
          unmatched.push({ datasheet: sheet.name, profile: profile.name, type: profile.type })
          continue
        }
        counts[weapon ? 'weaponMatched' : 'unitMatched']++
        let same = true
        for (const value of profile.values) {
          const characteristic = datasheetCharacteristicKind(value.name)
          const vsData = line[characteristic]
          if (vsData === undefined || comparable(vsData) === comparable(value.value)) continue
          same = false
          byCharacteristic[characteristic] = (byCharacteristic[characteristic] ?? 0) + 1
          differences.push({ datasheet: sheet.name, profile: profile.name, characteristic, catalogue: value.value, vsData })
        }
        // A characteristic VS Data prints that the catalogue's profile has none of.
        for (const [characteristic, vsData] of Object.entries(line))
          if (
            vsData &&
            !profile.values.some((value) => datasheetCharacteristicKind(value.name) === characteristic) &&
            (characteristic === 'keywords' || (weapon ? characteristic !== 'ballistic-skill' && characteristic !== 'weapon-skill' : true))
          ) {
            same = false
            byCharacteristic[characteristic] = (byCharacteristic[characteristic] ?? 0) + 1
            differences.push({ datasheet: sheet.name, profile: profile.name, characteristic, catalogue: '', vsData })
          }
        counts[same ? 'same' : 'different']++
      }
    }
  report[entry.edition.id] = { counts, byCharacteristic, unjoined: [...unjoined].toSorted(), unmatched, differences }
  console.log(`${entry.edition.id}:`, JSON.stringify(counts), JSON.stringify(byCharacteristic))
  if (values.list) for (const difference of differences) console.log('  ', Object.values(difference).join(' | '))
}

/** Values compared as a datasheet means them: case and the order of weapon keywords do not matter. */
function comparable(text: string) {
  return text
    .toLowerCase()
    .split(/,\s*/)
    .map((part) => part.trim())
    .toSorted()
    .join(', ')
    .replace(/^(-|n\/a)$/, '-')
}

fs.mkdirSync('data-dev', { recursive: true })
fs.writeFileSync('data-dev/vs-data-profile-parity.json', `${JSON.stringify(report, null, 2)}\n`)
