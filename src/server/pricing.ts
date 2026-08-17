import { attachmentErrors, attachmentOf } from '../core/attach'
import { detachmentPointBudget, detachmentPointsError, KOTC_LIMIT } from '../core/battle'
import { evaluate, evaluateForces, type Selection } from '../core/evaluate'
import { buildUnit, wargearOf } from '../core/roster'
import { app } from './app'
import { datasheetIn } from './catalogue'
import { detachmentCatalogueDetail } from './catalogueDescriptions'
import type { LoadedCatalogue } from './catalogueIndex'
import { groupOfEntry } from './cataloguePicker'
import { slug } from './rules'
import type { PriceInput } from './schemas'
import { descriptionKey, findDescription } from './wahapedia'

export function calculateRosterPrice(data: PriceInput) {
  const loaded = app().catalogue()
  if (!loaded) return null

  const { chosen, selections: detachmentSelection } = rosterDetachments(loaded, data.catalogueId, data.detachmentIds)
  // Enhancements and unit limits can depend on the detachment already being in
  // the roster when units are expanded.
  const rules = app().rules()
  const factionSlug = slug(loaded.index.catalogues.get(data.catalogueId)?.name ?? '')
  const references = rules?.detachmentReferences.get(factionSlug)
  const allowedDispositions = [
    ...new Set(
      chosen.flatMap((option) => {
        const fromRules = references?.get(slug(option.name))?.dispositions ?? []
        return fromRules.length ? fromRules : option.disposition ? [option.disposition] : []
      }),
    ),
  ]
  const { disposition, error: dispositionError } = resolveDisposition(allowedDispositions, data.disposition)
  const purchased = chosen.map((option) => ({
    name: option.name,
    points: references?.get(slug(option.name))?.points ?? null,
  }))
  const enhancementDescriptions = new Map(
    chosen.flatMap((option) =>
      (() => {
        const enhancements = rules?.detachmentDetails.get(factionSlug)?.get(slug(option.name))?.enhancements ?? []
        const catalogueDetail = detachmentCatalogueDetail(
          loaded,
          data.catalogueId,
          option.id,
          enhancements.map((enhancement) => enhancement.name),
        )
        return enhancements.flatMap((enhancement) => {
          const description =
            catalogueDetail?.enhancements.find((candidate) => candidate.name.toLocaleLowerCase() === enhancement.name.toLocaleLowerCase())
              ?.description ?? enhancement.description
          return description ? [[descriptionKey(option.name, enhancement.name), description] as const] : []
        })
      })(),
    ),
  )
  const budget = detachmentPointBudget(data.limit)
  const spent = purchased.reduce((total, option) => total + (option.points ?? 0), 0)
  const detachmentError = detachmentPointsError(purchased, budget)

  const picked = data.units.flatMap((wanted, key) => {
    const built = buildUnit(wanted.entryId, loaded.index, wanted.models, wanted.choices, {
      primaryCatalogueId: data.catalogueId,
      roster: detachmentSelection,
      spreads: wanted.spreads,
      toggles: wanted.toggles,
    })
    const entry = loaded.index.definitions.get(wanted.entryId)
    return built ? [{ key, entryId: wanted.entryId, name: entry?.name ?? wanted.entryId, ...built }] : []
  })

  const options = { primaryCatalogueId: data.catalogueId }
  const forceSelections = new Map<string, Selection[]>([[data.catalogueId, [...detachmentSelection]]])
  picked.forEach((unit) => {
    const owner = data.units[unit.key]?.catalogueId ?? loaded.index.catalogueOf.get(unit.entryId) ?? data.catalogueId
    const force = forceSelections.get(owner) ?? []
    force.push(unit.selection)
    forceSelections.set(owner, force)
  })
  const selections = [...forceSelections.values()].flat()
  const whole = evaluateForces([...forceSelections.values()], loaded.index, options)
  const kotcUnits = picked.map((unit) => {
    const catalogueId = data.units[unit.key]?.catalogueId ?? loaded.index.catalogueOf.get(unit.entryId) ?? data.catalogueId
    const sheet = datasheetIn(loaded, catalogueId, unit.entryId, {
      selections,
      unitSelectionIndex: selections.indexOf(unit.selection),
    })
    return {
      entryId: unit.entryId,
      name: unit.name,
      keywords: sheet?.keywords ?? [],
      toughness: toughnessOf(sheet?.profiles ?? []),
      warlord: Object.values(data.units[unit.key]?.toggles ?? {}).some((count) => count > 0),
    }
  })
  // The 10e catalogue wrapper caps detachments at one; the 11e rules source
  // replaces that constraint with the DP budget checked above.
  const errors = [
    ...whole.errors.filter(
      (error) =>
        !(chosen.length > 1 && error.entryName.toLowerCase().includes('detachment') && error.message.includes('allows at most 1, has ')),
    ),
    ...attachmentErrors(data.units, loaded.index),
    ...(data.limit === KOTC_LIMIT ? kotcViolations(chosen.length, kotcUnits) : []),
  ]

  return {
    revision: loaded.index.revision,
    detachment: chosen[0]?.name ?? null,
    detachments: purchased,
    detachmentPointBudget: budget,
    detachmentPointsSpent: spent,
    detachmentPointsOver: Boolean(detachmentError),
    detachmentError,
    disposition,
    dispositionError,
    points: whole.points,
    errors,
    unhandled: [
      ...whole.unhandled,
      ...(forceSelections.size > 1 ? ['allied-force eligibility is not present in the synced catalogue data'] : []),
    ],
    selections,
    units: picked.map((unit) => {
      const catalogueId = data.units[unit.key]?.catalogueId ?? loaded.index.catalogueOf.get(unit.entryId) ?? data.catalogueId
      const deployment = deploymentRules(datasheetIn(loaded, catalogueId, unit.entryId)?.abilities.map((ability) => ability.name) ?? [])
      return {
        key: unit.key,
        entryId: unit.entryId,
        name: unit.name,
        points: evaluate([unit.selection], loaded.index, options).points,
        size: { min: unit.size.min, max: unit.size.max, models: unit.size.models, resizable: unit.size.max > unit.size.min },
        ...deployment,
        choices: unit.choices.map((choice) =>
          choice.name.toLowerCase().includes('enhancement')
            ? {
                ...choice,
                options: choice.options.map((option) => ({
                  ...option,
                  description: findEnhancementDescription(enhancementDescriptions, chosen, option.name),
                })),
              }
            : choice,
        ),
        toggles: unit.toggles,
        enhancements: unit.choices
          .filter((choice) => choice.name.toLowerCase().includes('enhancement'))
          .flatMap((choice) => choice.options.filter((option) => option.count > 0).map((option) => option.name)),
        wargear: wargearOf(unit.selection, loaded.index),
        group: groupOfEntry(loaded.index, unit.entryId),
        attachment: attachmentOf(loaded.index.definitions.get(unit.entryId) ?? { id: unit.entryId }, loaded.index),
      }
    }),
  }
}

type KotcUnit = { entryId: string; name: string; keywords: readonly string[]; toughness: number | null; warlord: boolean }

/** Prototype KOTC 2.0 army-construction changes layered over normal Incursion legality. */
export function kotcViolations(detachments: number, units: readonly KotcUnit[]) {
  const errors: { entryId: string; entryName: string; message: string }[] = []
  const add = (message: string, unit?: KotcUnit) =>
    errors.push({ entryId: unit?.entryId ?? 'kotc', entryName: unit?.name ?? 'King of the Colosseum', message })
  if (detachments !== 1) add(`needs exactly 1 detachment, has ${detachments}`)
  if (units.filter((unit) => hasKeyword(unit, 'infantry')).length < 2) add('needs at least 2 Infantry units')
  if (!units.some((unit) => unit.warlord)) add('needs a Warlord')
  for (const unit of units) {
    if (hasKeyword(unit, 'epic hero')) add('does not allow Epic Heroes', unit)
    if (unit.toughness === null) add('cannot verify its Toughness from the synced catalogue', unit)
    else if (unit.toughness > 9) add(`does not allow Toughness ${unit.toughness}`, unit)
  }
  const toughnessNine = units.filter((unit) => unit.toughness === 9)
  if (toughnessNine.length > 1) add(`allows at most 1 Toughness 9 unit, has ${toughnessNine.length}`)
  const byDatasheet = new Map<string, KotcUnit[]>()
  for (const unit of units) byDatasheet.set(unit.entryId, [...(byDatasheet.get(unit.entryId) ?? []), unit])
  for (const copies of byDatasheet.values()) {
    const allowance = copies.some((unit) => hasKeyword(unit, 'battleline') || hasKeyword(unit, 'dedicated transport')) ? 2 : 1
    if (copies.length > allowance) add(`allows at most ${allowance} of this datasheet, has ${copies.length}`, copies[0])
  }
  return errors
}

const hasKeyword = (unit: KotcUnit, keyword: string) => unit.keywords.some((candidate) => candidate.trim().toLocaleLowerCase() === keyword)

function toughnessOf(profiles: readonly { type: string; values: readonly { name: string; value: string }[] }[]): number | null {
  const values = profiles
    .filter((profile) => profile.type.toLocaleLowerCase() === 'unit')
    .flatMap((profile) => profile.values)
    .filter((value) => ['t', 'toughness'].includes(value.name.trim().toLocaleLowerCase()))
    .map((value) => Number.parseInt(value.value, 10))
    .filter(Number.isFinite)
  return values.length ? Math.max(...values) : null
}

export function deploymentRules(abilityNames: readonly string[]) {
  const abilities = abilityNames.map((ability) => ability.toLocaleLowerCase())
  return {
    formationOptions: abilities.some((ability) => ability.includes('deep strike')) ? (['deep-strike'] as const) : [],
    prebattleRules: [
      ...(abilities.some((ability) => ability.includes('infiltrator')) ? (['infiltrators'] as const) : []),
      ...(abilities.some((ability) => ability.startsWith('scouts')) ? (['scouts'] as const) : []),
    ],
  }
}

export const findEnhancementDescription = (
  descriptions: ReadonlyMap<string, string>,
  detachments: readonly { name: string }[],
  enhancement: string,
) => detachments.map((detachment) => findDescription(descriptions, detachment.name, enhancement)).find(Boolean) ?? null

/** Selected detachments in the catalogue shape that roster-scoped conditions inspect. */
export function rosterDetachments(loaded: LoadedCatalogue, catalogueId: string, detachmentIds: readonly string[]) {
  const detachment = loaded.detachments.get(catalogueId)
  const chosen = detachmentIds.flatMap((id) => {
    const option = detachment?.options.find((candidate) => candidate.id === id)
    return option ? [option] : []
  })
  const selections: Selection[] = chosen.flatMap((option, index) =>
    index
      ? [{ id: option.id, count: 1 }]
      : detachment
        ? [
            {
              id: detachment.wrapperId,
              count: 1,
              selections: [{ id: detachment.groupId, count: 1, selections: [{ id: option.id, count: 1 }] }],
            },
          ]
        : [],
  )
  return { chosen, selections }
}

export function resolveDisposition(allowed: readonly string[], selected: string | null) {
  const disposition = allowed.includes(selected ?? '') ? selected : allowed.length === 1 ? allowed[0] : null
  return { disposition, error: allowed.length > 1 && !disposition ? 'Pick a disposition.' : null }
}
