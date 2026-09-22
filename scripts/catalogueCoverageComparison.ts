import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../src/core/slug'
import { constructionCardKey, datacardsFactionKeys } from '../src/server/datacards'
import { joinKey } from '../src/server/rulesSource'

type Described = { name: string; described: boolean }
type DetachmentAbilities = { name: string; abilities: Described[] }
type RosterCoverage = {
  points: number
  models: string[]
  wargear: string[]
  choices: string[]
  errors: string[]
  deployment: string[]
}
type DatasheetCoverage = {
  name: string
  points: number
  keywords: number
  profiles: string[]
  abilities: Described[]
  detachmentAbilities?: DetachmentAbilities[]
  keywordRules: string[]
  composition: number
  loadout: boolean
  wargearOptions: number
  baseSize: boolean
  attachments: string[]
  abilityNames?: string[]
  search?: string[]
  leaders: string[]
  roster: RosterCoverage | null
}
type DetachmentCoverage = {
  name: string
  rules: string[]
  enhancements: Described[]
  upgrades: Described[]
  stratagems: Described[]
}
type FactionCoverage = {
  name: string
  slug: string
  armyRules: string[]
  detachments: DetachmentCoverage[]
  datasheets: DatasheetCoverage[]
}
type AcceptedLoss = { reason: string; entries: string[] }
type RawConstruction = { name: string; enhancements: Set<string> }

const localizedName = (value: unknown) => {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return null
  const english = (value as Record<string, unknown>).en
  return typeof english === 'string' ? english : null
}

function rawConstructionReader(catalogueDirectory: string, rulesDirectory: string) {
  const byFaction = new Map<string, Map<string, RawConstruction>>()
  const datacardsDirectory = path.join(catalogueDirectory, 'datacards', '11th', 'gdc')
  for (const file of fs.readdirSync(datacardsDirectory).filter((entry) => entry.endsWith('.json'))) {
    const parsed = JSON.parse(fs.readFileSync(path.join(datacardsDirectory, file), 'utf8')) as Record<string, unknown>
    if (typeof parsed.name !== 'string' || !Array.isArray(parsed.detachments)) continue
    const detachments = new Map<string, RawConstruction>()
    for (const entry of parsed.detachments) {
      if (!entry || typeof entry !== 'object') continue
      const name = localizedName((entry as Record<string, unknown>).name)
      if (name) detachments.set(joinKey(name), { name, enhancements: new Set() })
    }
    if (Array.isArray(parsed.enhancements)) {
      for (const entry of parsed.enhancements) {
        if (!entry || typeof entry !== 'object') continue
        const record = entry as Record<string, unknown>
        const name = localizedName(record.name)
        const detachment = typeof record.detachment === 'string' ? record.detachment : null
        if (name && detachment) detachments.get(joinKey(detachment))?.enhancements.add(constructionCardKey(name))
      }
    }
    for (const key of datacardsFactionKeys(parsed.name)) byFaction.set(key, detachments)
  }

  const factionKeys = new Map<string, string>()
  const factionParents = new Map<string, string>()
  const rulesCore = path.join(rulesDirectory, 'data', 'core')
  for (const entry of fs.readdirSync(rulesCore, { withFileTypes: true }).filter((candidate) => candidate.isDirectory())) {
    factionKeys.set(entry.name, entry.name)
    const file = path.join(rulesCore, entry.name, 'factions.json')
    if (!fs.existsSync(file)) continue
    const factions = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>[]
    for (const faction of factions) {
      if (typeof faction.name === 'string') factionKeys.set(routeSlug(faction.name), entry.name)
      if (Array.isArray(faction.aliases)) {
        for (const alias of faction.aliases) if (typeof alias === 'string') factionKeys.set(routeSlug(alias), entry.name)
      }
      if (typeof faction.id === 'string' && typeof faction.parent_faction_id === 'string') {
        factionParents.set(faction.id, faction.parent_faction_id)
      }
    }
  }

  return (factionName: string) => {
    const faction = factionKeys.get(routeSlug(factionName)) ?? routeSlug(factionName)
    const own = byFaction.get(routeSlug(factionName)) ?? byFaction.get(faction)
    const inherited = byFaction.get(factionParents.get(faction) ?? '')
    const found = new Map<string, RawConstruction>()
    for (const source of [inherited, own]) for (const [key, detachment] of source ?? []) found.set(key, detachment)
    return found
  }
}

export function compareCatalogueCoverage(
  beforeFile: string,
  afterFile: string,
  accepted: AcceptedLoss[],
  catalogueDirectory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data'),
  rulesDirectory = process.env.RULES_DIR ?? path.join(catalogueDirectory, 'rules'),
) {
  const before: FactionCoverage[] = JSON.parse(fs.readFileSync(beforeFile, 'utf8'))
  const after: FactionCoverage[] = JSON.parse(fs.readFileSync(afterFile, 'utf8'))
  const rawConstructionFor = rawConstructionReader(catalogueDirectory, rulesDirectory)
  const lost: string[] = []
  const gained: string[] = []
  const compareLists = (where: string, earlier: readonly string[], later: readonly string[], key = (item: string) => item) => {
    const earlierKeys = new Set(earlier.map(key))
    const laterKeys = new Set(later.map(key))
    for (const item of earlier) if (!laterKeys.has(key(item))) lost.push(`${where}: ${item}`)
    for (const item of later) if (!earlierKeys.has(key(item))) gained.push(`${where}: ${item}`)
  }
  const compareDescribed = (where: string, earlier: readonly Described[], later: readonly Described[]) => {
    compareLists(
      where,
      earlier.map((entry) => entry.name),
      later.map((entry) => entry.name),
    )
    // One datasheet can carry a name twice, a described copy and a bare one, so the nth
    // is matched to the nth. Taking the first match compares the bare copy against the
    // described one and reports a loss the change did not cause.
    const nth = new Map<string, number>()
    for (const entry of earlier) {
      const position = nth.get(entry.name) ?? 0
      nth.set(entry.name, position + 1)
      const now = later.filter((candidate) => candidate.name === entry.name)[position]
      if (now && entry.described && !now.described) lost.push(`${where}: description of ${entry.name}`)
      if (now && !entry.described && now.described) gained.push(`${where}: description of ${entry.name}`)
    }
  }
  const compareConstruction = (where: string, earlier: readonly Described[], later: readonly Described[]) => {
    const unique = (entries: readonly Described[]) => {
      const found = new Map<string, Described>()
      for (const entry of entries) {
        const key = constructionCardKey(entry.name)
        const existing = found.get(key)
        found.set(key, { name: existing?.name ?? entry.name, described: existing?.described || entry.described })
      }
      return found
    }
    const earlierByKey = unique(earlier)
    const laterByKey = unique(later)
    for (const [key, entry] of earlierByKey) {
      const now = laterByKey.get(key)
      if (!now) lost.push(`${where}: ${entry.name}`)
      else if (entry.described && !now.described) lost.push(`${where}: description of ${entry.name}`)
    }
    for (const [key, entry] of laterByKey) {
      const prior = earlierByKey.get(key)
      if (!prior) gained.push(`${where}: ${entry.name}`)
      else if (!prior.described && entry.described) gained.push(`${where}: description of ${entry.name}`)
    }
  }

  for (const faction of before) {
    const now = after.find((candidate) => candidate.name === faction.name)
    if (!now) {
      lost.push(`faction ${faction.name}`)
      continue
    }
    const authoritative = rawConstructionFor(faction.name)
    compareLists(`${faction.slug} army rules`, faction.armyRules, now.armyRules)
    compareLists(
      `${faction.slug} detachments`,
      faction.detachments.filter((detachment) => authoritative.has(joinKey(detachment.name))).map((detachment) => detachment.name),
      now.detachments.map((detachment) => detachment.name),
    )
    for (const detachment of faction.detachments) {
      const current = now.detachments.find((candidate) => candidate.name === detachment.name)
      if (!current) continue
      const where = `${faction.slug} / ${detachment.name}`
      const constructionNames = authoritative.get(joinKey(detachment.name))?.enhancements ?? new Set()
      compareLists(`${where} rules`, detachment.rules, current.rules)
      compareConstruction(
        `${where} construction cards`,
        [...detachment.enhancements, ...detachment.upgrades].filter((entry) => constructionNames.has(constructionCardKey(entry.name))),
        [...current.enhancements, ...current.upgrades],
      )
      compareDescribed(`${where} stratagems`, detachment.stratagems, current.stratagems)
    }
    compareLists(
      `${faction.slug} datasheets`,
      faction.datasheets.map((sheet) => sheet.name),
      now.datasheets.map((sheet) => sheet.name),
    )
    // A book can hold two datasheets of one name (its own and an imported copy), so the nth is matched to the nth.
    const nth = new Map<string, number>()
    for (const sheet of faction.datasheets) {
      const position = nth.get(sheet.name) ?? 0
      nth.set(sheet.name, position + 1)
      const current = now.datasheets.filter((candidate) => candidate.name === sheet.name)[position]
      if (!current) continue
      const where = `${faction.slug} / ${sheet.name}`
      if (sheet.points !== current.points) lost.push(`${where}: points ${sheet.points} → ${current.points}`)
      compareLists(`${where} profiles`, sheet.profiles, current.profiles, (profile) => profile.toLowerCase())
      compareDescribed(`${where} abilities`, sheet.abilities, current.abilities)
      const detachmentAbilityNames = new Set([
        ...(sheet.detachmentAbilities ?? []).map((detachment) => detachment.name),
        ...(current.detachmentAbilities ?? []).map((detachment) => detachment.name),
      ])
      for (const name of detachmentAbilityNames) {
        const earlier = sheet.detachmentAbilities?.find((detachment) => detachment.name === name)
        const later = current.detachmentAbilities?.find((detachment) => detachment.name === name)
        compareDescribed(`${where} / ${name} detachment abilities`, earlier?.abilities ?? [], later?.abilities ?? [])
      }
      compareLists(`${where} keyword rules`, sheet.keywordRules, current.keywordRules)
      compareLists(`${where} attachments`, sheet.attachments, current.attachments)
      compareLists(`${where} ability names`, sheet.abilityNames ?? [], current.abilityNames ?? [])
      compareLists(`${where} search`, sheet.search ?? [], current.search ?? [])
      compareLists(`${where} leaders`, sheet.leaders, current.leaders)
      for (const field of ['composition', 'wargearOptions', 'keywords'] as const) {
        if (sheet[field] > current[field]) lost.push(`${where}: ${field} ${sheet[field]} → ${current[field]}`)
      }
      for (const field of ['loadout', 'baseSize'] as const) {
        if (sheet[field] && !current[field]) lost.push(`${where}: ${field}`)
      }
      if (sheet.roster && current.roster) {
        const roster = `${where} roster`
        if (sheet.roster.points !== current.roster.points) lost.push(`${roster}: points ${sheet.roster.points} → ${current.roster.points}`)
        for (const field of ['models', 'wargear', 'choices', 'errors', 'deployment'] as const) {
          compareLists(`${roster} ${field}`, sheet.roster[field] ?? [], current.roster[field] ?? [])
        }
      } else if (sheet.roster && !current.roster) {
        lost.push(`${where}: roster view`)
      }
    }
  }

  /*
   * A choice this change withdrew on purpose reads the same as a field it dropped by
   * accident, and only the person making the change can tell them apart. Each accepted
   * line is stated whole and with its reason, and a line that has stopped being lost
   * fails the run, so the list empties itself rather than growing quietly.
   */
  const claimed = new Set(accepted.flatMap((group) => group.entries))
  const withdrawn = lost.filter((line) => claimed.has(line))
  const stale = [...claimed].filter((line) => !lost.includes(line))
  const remaining = lost.filter((line) => !claimed.has(line))
  if (withdrawn.length) {
    console.log(`\n## withdrawn on purpose (${withdrawn.length})`)
    for (const group of accepted) {
      const held = group.entries.filter((entry) => claimed.has(entry) && lost.includes(entry))
      if (held.length) console.log(`  ${group.reason} (${held.length})`)
    }
  }
  if (stale.length) {
    console.log(`\n## no longer lost, so no longer accepted (${stale.length})`)
    for (const line of stale) console.log(`  ${line}`)
    throw new Error('accepted coverage losses that are no longer lost; remove them')
  }
  console.log(`\n## lost (${remaining.length})`)
  for (const line of remaining) console.log(`  ${line}`)
  console.log(`\n## gained (${gained.length})`)
  for (const line of gained) console.log(`  ${line}`)
  return { lost: remaining, gained }
}
