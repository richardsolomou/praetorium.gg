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
import { abilityNamesIn, datasheetIn, datasheetSearchFieldsIn } from '../src/shared/catalogue'
import { datasheetsOf, isReferenceDatasheet, loadCatalogue } from '../src/server/catalogueIndex'
import { describeDatasheetAbilities } from '../src/shared/datasheetDescriptions'
import { detachmentReference } from '../src/shared/detachmentReference'
import { factionsFor } from '../src/shared/factionReferences'
import { calculateRosterPrice } from '../src/shared/pricing'
import { loadRules } from '../src/server/rules'
import { routeSlug } from '../src/core/slug'
import { compareCatalogueCoverage } from './lib/catalogueCoverageComparison'

process.env.CATALOGUE_DIR ??= path.join(import.meta.dirname, '..', 'catalogue-data')

const arguments_ = process.argv.slice(2)
const output = arguments_[0]
if (!output) throw new Error('usage: catalogueCoverage.ts <out.json> [--compare <before.json>] [--accept <withdrawn.json>]')
const compareAt = arguments_.indexOf('--compare')
const previous = compareAt < 0 ? undefined : arguments_[compareAt + 1]
const acceptAt = process.argv[process.argv.indexOf('--accept') + 1]
const accepted: { reason: string; entries: string[] }[] =
  process.argv.includes('--accept') && acceptAt ? JSON.parse(fs.readFileSync(acceptAt, 'utf8')) : []
const shardAt = arguments_.indexOf('--shard')
const shard = shardAt < 0 ? null : arguments_[shardAt + 1]?.match(/^(\d+)\/(\d+)$/)
if (shardAt >= 0 && (!shard || Number(shard[2]) < 1 || Number(shard[1]) >= Number(shard[2]))) {
  throw new Error('--shard must be a zero-based index and count, for example 0/3')
}

const loaded = loadCatalogue(process.env.CATALOGUE_DIR)
if (!loaded) throw new Error('catalogue unavailable')
const rules = loadRules(undefined, undefined, undefined, undefined, loaded.datacards)
if (!rules) throw new Error('rules unavailable')

type Described = { name: string; described: boolean }
const described = (entries: readonly { name: string; description: string | null }[]): Described[] =>
  entries.map((entry) => ({ name: entry.name, described: Boolean(entry.description) })).toSorted(byName)
const byName = (left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name)

const factions = factionsFor(loaded, rules).factions
const snapshotFactions = loaded.factions.toSorted(byName).filter((_, index) => !shard || index % Number(shard[2]) === Number(shard[1]))
const snapshot = snapshotFactions.map((faction) => {
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
        rules,
      )
      const unit = priced?.units[0]
      // The loadout pane's view: every weapon the unit could take, in the context of the
      // unit as built. A priced force states its battle size and its detachments before
      // it states a unit, so the unit is looked up rather than assumed to lead.
      const selections = priced?.selections ?? []
      const at = selections.findIndex((selection) => selection.id === entryId)
      const context = at < 0 ? undefined : { selections, unitSelectionIndex: at, everyWeapon: true }
      const rawSheet = datasheetIn(loaded, faction.id, entryId, context)
      const sheet = describeDatasheetAbilities(loaded, faction.id, rawSheet, rules)
      const reference = describeDatasheetAbilities(loaded, faction.id, rawSheet, rules, {
        reference: true,
      })
      if (!sheet || !reference) return []
      const allAbilities = new Map(
        [...sheet.abilities, ...reference.detachments.flatMap((detachment) => detachment.abilities)].map((ability) => [
          `${ability.kind}:${ability.id}`,
          ability,
        ]),
      )
      const abilities = [...allAbilities.values()]
      return [
        {
          name: sheet.name,
          reference: isReferenceDatasheet(loaded, faction.id, entryId),
          points: sheet.points,
          keywords: sheet.keywords.length,
          profiles: sheet.profiles.map((profile) => `${profile.type}: ${profile.name}`).toSorted(),
          abilities: described(abilities).map((ability) => ({
            ...ability,
            kind: abilities.find((candidate) => candidate.name === ability.name)?.kind,
          })),
          detachmentAbilities: reference.detachments
            .flatMap((detachment) =>
              detachment.abilities.length ? [{ name: detachment.name, abilities: described(detachment.abilities) }] : [],
            )
            .toSorted(byName),
          keywordRules: sheet.keywordRules.map((rule) => rule.name).toSorted(),
          composition: sheet.composition.length,
          loadout: Boolean(sheet.loadout),
          wargearOptions: sheet.wargearOptions.length,
          baseSize: Boolean(sheet.baseSize),
          attachments: sheet.attachments.map((target) => target.name).toSorted(),
          abilityNames: abilityNamesIn(loaded, faction.id, entryId).toSorted(),
          search: (() => {
            const fields = datasheetSearchFieldsIn(loaded, faction.id, entryId)
            return fields
              ? [
                  ...fields.abilities.map((a) => `ability:${a}`),
                  ...fields.weapons.map((w) => `weapon:${w}`),
                  ...fields.weaponKeywords.map((k) => `weapon keyword:${k}`),
                  ...fields.wargear.map((w) => `wargear:${w}`),
                ].toSorted()
              : []
          })(),
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
                deployment: [...unit.formationOptions, ...unit.prebattleRules].toSorted(),
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
  detachmentAbilities: snapshot.reduce(
    (total, faction) =>
      total +
      faction.datasheets.reduce(
        (sum, sheet) => sum + sheet.detachmentAbilities.reduce((abilities, detachment) => abilities + detachment.abilities.length, 0),
        0,
      ),
    0,
  ),
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

if (previous) compareCatalogueCoverage(previous, output, accepted)
