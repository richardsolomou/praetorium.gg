/**
 * Everything the app can say about the synced data, written down so two revisions of
 * the code can be compared field by field.
 *
 * `tsx scripts/catalogueCoverage.ts out.json` writes the snapshot;
 * `tsx scripts/catalogueCoverage.ts out.json --compare before.json` also lists what
 * the earlier snapshot had that this one does not.
 */
import fs from 'node:fs'
import { parseArgs } from 'node:util'
import { abilityNamesIn, datasheetIn, datasheetSearchFieldsIn } from '../src/shared/catalogue'
import { datasheetsOf, isReferenceDatasheet } from '../src/server/catalogueIndex'
import { describeDatasheetAbilities } from '../src/shared/datasheetDescriptions'
import { detachmentReference } from '../src/shared/detachmentReference'
import { factionsFor } from '../src/shared/factionReferences'
import { calculateRosterPrice } from '../src/shared/pricing'
import { routeSlug } from '../src/core/slug'
import { compareCatalogueCoverage, readAcceptedLosses } from './lib/catalogueCoverageComparison'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { parsePart } from './lib/part'

process.env.CATALOGUE_DIR = catalogueDataDirectory()

const {
  positionals: [output],
  values,
} = parseArgs({ allowPositionals: true, options: { compare: { type: 'string' }, accept: { type: 'string' }, shard: { type: 'string' } } })
if (!output) throw new Error('usage: catalogueCoverage.ts <out.json> [--compare <before.json>] [--accept <withdrawn.json>]')
const previous = values.compare
const accepted = readAcceptedLosses(values.accept)
const shard = values.shard === undefined ? null : parsePart(values.shard, '--shard')

const { catalogue: loaded, rules } = loadSnapshotWithRules(process.env.CATALOGUE_DIR)

type Described = { name: string; described: boolean }
const described = (entries: readonly { name: string; description: string | null }[]): Described[] =>
  entries.map((entry) => ({ name: entry.name, described: Boolean(entry.description) })).toSorted(byName)
const byName = (left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name)

const factions = factionsFor(loaded, rules).factions
const snapshotFactions = loaded.factions.toSorted(byName).filter((_, index) => !shard || index % shard.count === shard.index)
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
