import { attachmentErrors, attachmentOf } from '../core/attach'
import { detachmentPointBudget, detachmentPointsError } from '../core/battle'
import { evaluate, evaluateForces, type Selection } from '../core/evaluate'
import { buildUnit, wargearOf } from '../core/roster'
import { app } from './app'
import { groupOfEntry } from './catalogue'
import { slug } from './rules'
import type { PriceInput } from './schemas'

export function calculateRosterPrice(data: PriceInput) {
  const loaded = app().catalogue()
  if (!loaded) return null

  const detachment = loaded.detachments.get(data.catalogueId)
  const chosen = data.detachmentIds.flatMap((id) => {
    const option = detachment?.options.find((candidate) => candidate.id === id)
    return option ? [option] : []
  })
  // Enhancements and unit limits can depend on the detachment already being in
  // the roster when units are expanded.
  const detachmentSelection: Selection[] = chosen.flatMap((option, index) =>
    index
      ? [{ id: option.id, count: 1 }]
      : [
          {
            id: detachment!.wrapperId,
            count: 1,
            selections: [{ id: detachment!.groupId, count: 1, selections: [{ id: option.id, count: 1 }] }],
          },
        ],
  )
  const references = app()
    .rules()
    ?.detachmentReferences.get(slug(loaded.index.catalogues.get(data.catalogueId)?.name ?? ''))
  const purchased = chosen.map((option) => ({
    name: option.name,
    points: references?.get(slug(option.name))?.points ?? null,
  }))
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
  // The 10e catalogue wrapper caps detachments at one; the 11e rules source
  // replaces that constraint with the DP budget checked above.
  const errors = [
    ...whole.errors.filter(
      (error) =>
        !(chosen.length > 1 && error.entryName.toLowerCase().includes('detachment') && error.message.includes('allows at most 1, has ')),
    ),
    ...attachmentErrors(data.units, loaded.index),
  ]

  return {
    revision: loaded.index.revision,
    detachment: chosen[0]?.name ?? null,
    detachments: purchased,
    detachmentPointBudget: budget,
    detachmentPointsSpent: spent,
    detachmentPointsOver: Boolean(detachmentError),
    detachmentError,
    disposition: chosen[0]?.disposition ?? null,
    points: whole.points,
    errors,
    unhandled: [
      ...whole.unhandled,
      ...(forceSelections.size > 1 ? ['allied-force eligibility is not present in the synced catalogue data'] : []),
    ],
    selections,
    units: picked.map((unit) => ({
      key: unit.key,
      entryId: unit.entryId,
      name: unit.name,
      points: evaluate([unit.selection], loaded.index, options).points,
      size: { min: unit.size.min, max: unit.size.max, models: unit.size.models, resizable: unit.size.max > unit.size.min },
      choices: unit.choices,
      toggles: unit.toggles,
      enhancements: unit.choices
        .filter((choice) => choice.name.toLowerCase().includes('enhancement'))
        .flatMap((choice) => choice.options.filter((option) => option.count > 0).map((option) => option.name)),
      wargear: wargearOf(unit.selection, loaded.index),
      group: groupOfEntry(loaded.index, unit.entryId),
      attachment: attachmentOf(loaded.index.definitions.get(unit.entryId) ?? { id: unit.entryId }, loaded.index),
    })),
  }
}
