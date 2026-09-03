import fs from 'node:fs'
import path from 'node:path'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { normalizedName } from '../src/core/name'

/**
 * Cross-checks 40kdc's generated `loadout_variants` against this app's own reading
 * of the same BSData catalogues. Two independent extractions of one source: a name
 * set only agrees if both found the same variants.
 *
 * No released 40kdc carries `loadout_variants` yet, so the synced snapshot has nothing
 * to check and `KDC_CORE` points this at a checkout that does.
 */
const directory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
const core = process.env.KDC_CORE ?? path.join(directory, 'rules', 'data', 'core')
const loaded = loadCatalogue(directory)
if (!loaded) throw new Error('catalogue data is unavailable')
const { definitions } = loaded.index

const readJSON = <T>(at: string): T => JSON.parse(fs.readFileSync(at, 'utf8')) as T
const english = (value: unknown): string =>
  typeof value === 'string' ? value : typeof (value as { en?: unknown })?.en === 'string' ? (value as { en: string }).en : ''

/**
 * Every model name reachable under a datasheet. Deliberately an exhaustive scan of the
 * subtree rather than a structured walk of groups and tiers: the extractor navigates the
 * shape, so this side must not, or the two would agree by sharing an assumption.
 */
function variantNamesIn(entryId: string): Set<string> {
  const names = new Set<string>()
  const visited = new Set<unknown>()
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object' || visited.has(node)) return
    visited.add(node)
    const record = node as Record<string, unknown>
    if (record.type === 'model' && typeof record.name === 'string') names.add(normalizedName(record.name))
    if (typeof record.targetId === 'string') {
      const target = definitions.get(record.targetId)
      if (target) {
        if (typeof record.name === 'string' && (target as { type?: string }).type === 'model') names.add(normalizedName(record.name))
        walk(target)
      }
    }
    for (const value of Object.values(record)) walk(value)
  }
  const entry = definitions.get(entryId)
  if (entry) walk(entry)
  return names
}

let units = 0
let agreed = 0
const disagreements: string[] = []
let scopeViolations = 0
let generatedOptions = 0
const scopeExamples: string[] = []

for (const faction of fs.readdirSync(core).filter((f) => !f.startsWith('_'))) {
  const compsAt = path.join(core, faction, 'unit-compositions.json')
  const unitsAt = path.join(core, faction, 'units.json')
  if (!fs.existsSync(compsAt) || !fs.existsSync(unitsAt)) continue
  const unitRecords = readJSON<Record<string, any>[]>(unitsAt)
  const equipment = ['weapons', 'wargear'].flatMap((file) => {
    const at = path.join(core, faction, `${file}.json`)
    return fs.existsSync(at) ? readJSON<Record<string, any>[]>(at) : []
  })
  const familyOf = new Map<string, string[]>()
  for (const item of equipment) {
    const key = normalizedName(english(item.name))
    familyOf.set(key, [...(familyOf.get(key) ?? []), String(item.id)])
  }
  const nameOfId = new Map(equipment.map((item) => [String(item.id), normalizedName(english(item.name))]))
  const unitIds = unitRecords.map((record) => String(record.id))

  // The same ownership rule governs generated wargear options.
  const optionsAt = path.join(core, faction, 'wargear-options.json')
  if (fs.existsSync(optionsAt)) {
    for (const option of readJSON<Record<string, any>[]>(optionsAt)) {
      if (!String(option.id).includes('-wgo-bsdata-')) continue
      const unitId = String(option.unit_id)
      const ids: string[] = [...(option.replaces ?? []), ...(option.replacement ?? []), ...(option.replacement_choice ?? []).flat()]
      for (const id of ids) {
        const owner = unitIds
          .filter((other) => id.endsWith(`-${other}`))
          .reduce<string | null>((longest, other) => (!longest || other.length > longest.length ? other : longest), null)
        if (owner && owner !== unitId) {
          scopeViolations++
          if (scopeExamples.length < 8) scopeExamples.push(`${faction} | ${unitId} | option ${id} belongs to ${owner}`)
        }
      }
      generatedOptions++
    }
  }

  for (const composition of readJSON<Record<string, any>[]>(compsAt)) {
    const withVariants = (composition.models ?? []).filter((m: any) => m.loadout_variants)
    if (!withVariants.length) continue
    const unitId = String(composition.unit_id)
    const unit = unitRecords.find((u) => String(u.id) === unitId)
    const reference = (unit?.external_refs ?? []).find((r: any) => r.namespace === 'bsdata')
    if (!reference || !definitions.has(String(reference.id))) continue
    units++

    const ours = variantNamesIn(String(reference.id))
    const theirs = new Set<string>(withVariants.flatMap((m: any) => m.loadout_variants.map((v: any) => normalizedName(v.name))))
    const missing = [...theirs].filter((n) => !ours.has(n))
    if (missing.length) disagreements.push(`${faction} | ${unitId} | not a BSData model here: ${missing.join(', ')}`)
    else agreed++

    // No variant may borrow another unit's stat variant: an id is the family base or this unit's own.
    for (const model of withVariants) {
      for (const variant of model.loadout_variants) {
        for (const id of variant.weapon_ids as string[]) {
          const itemName = nameOfId.get(id)
          if (!itemName) continue
          // 40kdc's weapon-variants pass mints `${item}-${unit}` for a unit's own stat variant.
          // Borrowing another unit's variant is the failure this guards: it silently gives a
          // model the wrong profile, and both sources still look self-consistent.
          // One unit id can be a suffix of another, so the longest match is the owner:
          // `choppa-beast-snagga-boyz` ends in `-boyz` but belongs to the beast snaggas.
          const owner = unitIds
            .filter((other) => id.endsWith(`-${other}`))
            .reduce<string | null>((longest, other) => (!longest || other.length > longest.length ? other : longest), null)
          const borrowed = owner && owner !== unitId ? owner : null
          if (borrowed) {
            scopeViolations++
            if (scopeExamples.length < 8) scopeExamples.push(`${faction} | ${unitId} | ${id} belongs to ${borrowed}`)
          }
        }
      }
    }
  }
}

console.log(`units carrying generated loadout_variants: ${units}`)
console.log(`  every variant name is a BSData model here: ${agreed}`)
console.log(`  disagreements:                             ${disagreements.length}`)
for (const line of disagreements.slice(0, 10)) console.log(`    ${line}`)
console.log(`generated wargear options checked:       ${generatedOptions}`)
console.log(`equipment ids scoped to another unit: ${scopeViolations}`)
for (const line of scopeExamples) console.log(`    ${line}`)
// Nothing found is not agreement: without this the check passes loudest where it applies least.
if (!units) throw new Error(`no unit under ${core} carries loadout_variants; set KDC_CORE to a checkout that generates them`)
if (disagreements.length || scopeViolations) throw new Error('40kdc loadout_variants disagree with this app’s reading of BSData')
