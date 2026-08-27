/**
 * Everything the app can say about the synced data, written down so two revisions of
 * the code can be compared field by field.
 *
 * `tsx scripts/catalogueCoverage.ts out.json` writes the snapshot;
 * `tsx scripts/catalogueCoverage.ts out.json --compare before.json` also lists what
 * the earlier snapshot had that this one does not.
 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from '../src/server/app'
import { datasheetIn } from '../src/server/catalogue'
import { datasheetsOf, isReferenceDatasheet, loadCatalogue } from '../src/server/catalogueIndex'
import { describeDatasheetAbilities } from '../src/server/datasheetDescriptions'
import { detachmentReference } from '../src/server/detachmentReference'
import { factionsFor } from '../src/server/factionReferences'
import { calculateRosterPrice } from '../src/server/pricing'
import { routeSlug } from '../src/core/slug'

process.env.CATALOGUE_DIR ??= path.join(import.meta.dirname, '..', 'catalogue-data')
process.env.RULES_DIR ??= path.join(process.env.CATALOGUE_DIR, 'rules')
process.env.DATABASE_URL ??= 'postgres://coverage:coverage@localhost/coverage'

const [output, flag, previous] = process.argv.slice(2)
if (!output) throw new Error('usage: catalogueCoverage.ts <out.json> [--compare <before.json>]')

const loaded = loadCatalogue(process.env.CATALOGUE_DIR)
if (!loaded) throw new Error('catalogue unavailable')
const rules = app().rules()
if (!rules) throw new Error('rules unavailable')

type Described = { name: string; described: boolean }
const described = (entries: readonly { name: string; description: string | null }[]): Described[] =>
  entries.map((entry) => ({ name: entry.name, described: Boolean(entry.description) })).toSorted(byName)
const byName = (left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name)

const factions = factionsFor(loaded, rules).factions
const snapshot = loaded.factions.toSorted(byName).map((faction) => {
  const full = factions.find((candidate) => candidate.id === faction.id)!
  const detachments = full.detachments
    .filter((detachment) => full.referenceDetachmentIds.includes(detachment.id))
    .map((detachment) => {
      const reference = detachmentReference(loaded, rules, faction.id, detachment.slug)
      return {
        name: detachment.name,
        points: reference?.points ?? null,
        rules: reference?.rules.map((rule) => rule.name).toSorted() ?? [],
        enhancements: described(reference?.enhancements ?? []),
        upgrades: described(reference?.upgrades ?? []),
        stratagems: described(reference?.stratagems ?? []),
      }
    })
    .toSorted(byName)
  const datasheets = [...datasheetsOf(loaded.index, faction.id)]
    .flatMap((entryId) => {
      const priced = calculateRosterPrice(
        { catalogueId: faction.id, detachmentIds: [], disposition: null, limit: 2_000, units: [{ entryId }] },
        loaded,
      )
      const unit = priced?.units[0]
      // The loadout pane's view: every weapon the unit could take, in the context of the unit as built.
      const context = priced?.selections.length ? { selections: priced.selections, unitSelectionIndex: 0, everyWeapon: true } : undefined
      const sheet = describeDatasheetAbilities(loaded, faction.id, datasheetIn(loaded, faction.id, entryId, context), rules)
      if (!sheet) return []
      return [
        {
          name: sheet.name,
          reference: isReferenceDatasheet(loaded, faction.id, entryId),
          points: sheet.points,
          keywords: sheet.keywords.length,
          profiles: sheet.profiles.map((profile) => `${profile.type}: ${profile.name}`).toSorted(),
          abilities: described(sheet.abilities).map((ability) => ({
            ...ability,
            kind: sheet.abilities.find((candidate) => candidate.name === ability.name)?.kind,
          })),
          keywordRules: sheet.keywordRules.map((rule) => rule.name).toSorted(),
          composition: sheet.composition.length,
          loadout: Boolean(sheet.loadout),
          wargearOptions: sheet.wargearOptions.length,
          baseSize: Boolean(sheet.baseSize),
          attachments: sheet.attachments.map((target) => target.name).toSorted(),
          leaders: sheet.leaders.map((target) => target.name).toSorted(),
          roster: unit
            ? {
                points: unit.points,
                models: unit.models.map((kind) => `${kind.name} (${kind.rows.length} rows, ${kind.fixed.length} fixed)`).toSorted(),
                wargear: unit.wargear.map((piece) => `${piece.name} ×${piece.count}`).toSorted(),
                choices: unit.choices
                  .map((choice) => `${choice.name}: ${choice.options.map((option) => option.name).join('; ')}`)
                  .toSorted(),
                errors: priced.errors.map((error) => error.message).toSorted(),
              }
            : null,
        },
      ]
    })
    .toSorted(byName)
  return {
    name: faction.name,
    slug: routeSlug(faction.name),
    armyRules: full.armyRules.map((rule) => rule.name).toSorted(),
    detachments,
    datasheets,
  }
})

fs.writeFileSync(output, JSON.stringify(snapshot, null, 1))

const count = {
  datasheets: snapshot.reduce((total, faction) => total + faction.datasheets.length, 0),
  describedAbilities: snapshot.reduce(
    (total, faction) =>
      total + faction.datasheets.reduce((sum, sheet) => sum + sheet.abilities.filter((ability) => ability.described).length, 0),
    0,
  ),
  abilities: snapshot.reduce((total, faction) => total + faction.datasheets.reduce((sum, sheet) => sum + sheet.abilities.length, 0), 0),
  detachments: snapshot.reduce((total, faction) => total + faction.detachments.length, 0),
  detachmentRules: snapshot.reduce(
    (total, faction) => total + faction.detachments.filter((detachment) => detachment.rules.length).length,
    0,
  ),
  describedEnhancements: snapshot.reduce(
    (total, faction) =>
      total +
      faction.detachments.reduce(
        (sum, detachment) => sum + [...detachment.enhancements, ...detachment.upgrades].filter((entry) => entry.described).length,
        0,
      ),
    0,
  ),
  enhancements: snapshot.reduce(
    (total, faction) =>
      total + faction.detachments.reduce((sum, detachment) => sum + detachment.enhancements.length + detachment.upgrades.length, 0),
    0,
  ),
  describedStratagems: snapshot.reduce(
    (total, faction) =>
      total + faction.detachments.reduce((sum, detachment) => sum + detachment.stratagems.filter((entry) => entry.described).length, 0),
    0,
  ),
  stratagems: snapshot.reduce(
    (total, faction) => total + faction.detachments.reduce((sum, detachment) => sum + detachment.stratagems.length, 0),
    0,
  ),
  armyRules: snapshot.filter((faction) => faction.armyRules.length).length,
  modelPanels: snapshot.reduce((total, faction) => total + faction.datasheets.filter((sheet) => sheet.roster?.models.length).length, 0),
}
console.log(count)

if (flag === '--compare' && previous) {
  const before: typeof snapshot = JSON.parse(fs.readFileSync(previous, 'utf8'))
  const lost: string[] = []
  const gained: string[] = []
  const compareLists = (where: string, earlier: readonly string[], later: readonly string[]) => {
    for (const item of earlier) if (!later.includes(item)) lost.push(`${where}: ${item}`)
    for (const item of later) if (!earlier.includes(item)) gained.push(`${where}: ${item}`)
  }
  const compareDescribed = (where: string, earlier: readonly Described[], later: readonly Described[]) => {
    compareLists(
      where,
      earlier.map((entry) => entry.name),
      later.map((entry) => entry.name),
    )
    for (const entry of earlier) {
      const now = later.find((candidate) => candidate.name === entry.name)
      if (now && entry.described && !now.described) lost.push(`${where}: description of ${entry.name}`)
      if (now && !entry.described && now.described) gained.push(`${where}: description of ${entry.name}`)
    }
  }
  for (const faction of before) {
    const now = snapshot.find((candidate) => candidate.name === faction.name)
    if (!now) {
      lost.push(`faction ${faction.name}`)
      continue
    }
    compareLists(`${faction.slug} army rules`, faction.armyRules, now.armyRules)
    compareLists(
      `${faction.slug} detachments`,
      faction.detachments.map((detachment) => detachment.name),
      now.detachments.map((detachment) => detachment.name),
    )
    for (const detachment of faction.detachments) {
      const current = now.detachments.find((candidate) => candidate.name === detachment.name)
      if (!current) continue
      const where = `${faction.slug} / ${detachment.name}`
      compareLists(`${where} rules`, detachment.rules, current.rules)
      compareDescribed(`${where} enhancements`, detachment.enhancements, current.enhancements)
      compareDescribed(`${where} upgrades`, detachment.upgrades, current.upgrades)
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
      compareLists(`${where} profiles`, sheet.profiles, current.profiles)
      compareDescribed(`${where} abilities`, sheet.abilities, current.abilities)
      compareLists(`${where} keyword rules`, sheet.keywordRules, current.keywordRules)
      compareLists(`${where} attachments`, sheet.attachments, current.attachments)
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
        for (const field of ['models', 'wargear', 'choices', 'errors'] as const) {
          compareLists(`${roster} ${field}`, sheet.roster[field] ?? [], current.roster[field] ?? [])
        }
      } else if (sheet.roster && !current.roster) {
        lost.push(`${where}: roster view`)
      }
    }
  }
  console.log(`\n## lost (${lost.length})`)
  for (const line of lost) console.log(`  ${line}`)
  console.log(`\n## gained (${gained.length})`)
  for (const line of gained) console.log(`  ${line}`)
}
