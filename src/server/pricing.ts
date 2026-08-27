import { attachmentErrors, attachmentOf } from '../core/attach'
import { routeSlug } from '../core/slug'
import {
  detachmentPointBudget,
  detachmentPointsError,
  formatDatasheetLimit,
  isKotcLimit,
  kotcDatasheetRepeatable,
  kotcUnitExclusions,
} from '../core/battle'
import { type CatalogueIndex, targetOf } from '../core/catalogue'
import { evaluate, evaluateForces, keywordIdsBySelection, type Selection } from '../core/evaluate'
import { type ModelKind, modelKindsOf, modelRowCount, modelRowSources, optionWargear } from '../core/modelKinds'
import { buildUnit } from '../core/roster'
import { allAt } from '../core/selection'
import { type ChoiceOptions, isUnitCompositionChoice, unitChoices } from '../core/unitChoices'
import { withUnitSpread } from '../core/unitSpread'
import { wargearKey, wargearOf } from '../core/wargear'
import { app } from './app'
import { contextualAbilityNamesIn, datasheetIn, rulesReferencedIn, toughnessOf } from './catalogue'
import { describedEnhancements } from './catalogueDescriptions'
import { descriptionKey, type FactionRestrictions, restrictedBy } from './datacards'
import { groupOfEntry } from './cataloguePicker'
import { rosterDetachments } from './rosterDetachments'
import { type LoadedCatalogue } from './catalogueIndex'
import { rulesFaction } from './rules'
import type { PriceInput } from './schemas'

export { rosterDetachments }

/**
 * A list as the catalogue reads it: every pick expanded, grouped by the book it
 * came from.
 *
 * Pulled out because the whole price and the points alone both start here, and a
 * library row and the editor showing different totals for one list would be the
 * plainest possible version of the same question answered twice.
 */
function rosterForces(loaded: LoadedCatalogue, data: PriceInput, detachmentSelection: readonly Selection[]) {
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
  const forceSelections = new Map<string, Selection[]>([[data.catalogueId, [...detachmentSelection]]])
  for (const unit of picked) {
    const owner = data.units[unit.key]?.catalogueId ?? loaded.index.catalogueOf.get(unit.entryId) ?? data.catalogueId
    const force = forceSelections.get(owner) ?? []
    force.push(unit.selection)
    forceSelections.set(owner, force)
  }
  return { picked, forceSelections }
}

type ReplacementChoice = {
  key: string
  options: readonly { id: string; count: number; max: number }[]
}

type ReplacementSource = { choiceKey: string; optionId: string }

const replacementKey = ({ choiceKey, optionId }: ReplacementSource) => `${choiceKey}\0${optionId}`

function legalReplacementPairs(
  entryId: string,
  selection: Selection,
  choices: readonly ReplacementChoice[],
  models: readonly ModelKind[],
  index: CatalogueIndex,
  options: ChoiceOptions,
): ReadonlyMap<string, ReplacementSource[]> {
  type Found = { choice: ReplacementChoice; option: ReplacementChoice['options'][number] }
  const find = ({ choiceKey, optionId }: ReplacementSource): Found | null => {
    const choice = choices.find((candidate) => candidate.key === choiceKey)
    const option = choice?.options.find((candidate) => candidate.id === optionId)
    return choice && option ? { choice, option } : null
  }
  const evaluated = (candidate: Selection) =>
    evaluate([...(options.roster ?? []), candidate], index, { primaryCatalogueId: options.primaryCatalogueId })
  let baseline: Set<string> | null = null
  const legal = (taker: Found, donor: Found) => {
    const wanted = new Map<string, Record<string, number>>()
    for (const [found, delta] of [
      [donor, -1],
      [taker, 1],
    ] as const) {
      const counts = wanted.get(found.choice.key) ?? {}
      counts[found.option.id] = found.option.count + delta
      wanted.set(found.choice.key, counts)
    }
    let candidate = selection
    for (const [key, counts] of wanted) candidate = withUnitSpread(candidate, key, counts, index)
    const rebuilt = unitChoices(entryId, candidate, index, options)
    const rebuiltCount = (found: Found) =>
      rebuilt.find((choice) => choice.key === found.choice.key)?.options.find((option) => option.id === found.option.id)?.count ?? 0
    if (rebuiltCount(taker) !== taker.option.count + 1 || rebuiltCount(donor) !== donor.option.count - 1) return false
    baseline ??= new Set(evaluated(selection).errors.map((error) => `${error.entryId}\0${error.message}`))
    return evaluated(candidate).errors.every((error) => baseline?.has(`${error.entryId}\0${error.message}`))
  }

  const found = new Map<string, ReplacementSource[]>()
  for (const model of models) {
    for (const takerRow of model.rows.filter((row) => row.pieces?.length)) {
      const donors = model.rows.filter(
        (row) => row !== takerRow && takerRow.pieces?.some((piece) => routeSlug(piece) === routeSlug(row.name)),
      )
      for (const takerSource of modelRowSources(takerRow)) {
        const taker = find(takerSource)
        if (!taker || taker.option.count < taker.option.max) continue
        for (const donorRow of donors) {
          for (const donorSource of modelRowSources(donorRow)) {
            const donor = find(donorSource)
            if (!donor || donor.option.count <= 0 || !legal(taker, donor)) continue
            const key = replacementKey(takerSource)
            const replacements = found.get(key) ?? []
            if (!replacements.some((source) => replacementKey(source) === replacementKey(donorSource))) {
              replacements.push(donorSource)
              found.set(key, replacements)
            }
          }
        }
      }
    }
  }
  return found
}

/**
 * What a list costs, and nothing else.
 *
 * The library shows one number per row and used to get it by pricing the whole
 * list — every datasheet resolved, every relic described, every keyword rule
 * gathered — then sending fifty kilobytes back so a row could print an integer.
 * The number comes from the same `evaluateForces` the full price uses, so this is
 * that price with the display work left off rather than a second opinion about
 * what a list costs.
 */
export function calculateRosterPoints(data: PriceInput) {
  const loaded = app().catalogue()
  if (!loaded) return null
  const { selections: detachmentSelection } = rosterDetachments(loaded, data.catalogueId, data.detachmentIds)
  const { forceSelections } = rosterForces(loaded, data, detachmentSelection)
  return evaluateForces([...forceSelections.values()], loaded.index, { primaryCatalogueId: data.catalogueId }).points
}

export function calculateRosterPrice(data: PriceInput, loaded = app().catalogue()) {
  if (!loaded) return null

  const { chosen, selections: detachmentSelection } = rosterDetachments(loaded, data.catalogueId, data.detachmentIds)
  // Enhancements and unit limits can depend on the detachment already being in
  // the roster when units are expanded.
  const rules = app().rules()
  const factionSlug = routeSlug(loaded.index.catalogues.get(data.catalogueId)?.name ?? '')
  const references = rules?.detachmentReferences.get(rulesFaction(rules, factionSlug))
  const allowedDispositions = [
    ...new Set(
      chosen.flatMap((option) => {
        const fromRules = references?.get(routeSlug(option.name))?.dispositions ?? []
        return fromRules.length ? fromRules : option.disposition ? [option.disposition] : []
      }),
    ),
  ]
  const { disposition, error: dispositionError } = resolveDisposition(allowedDispositions, data.disposition)
  const purchased = chosen.map((option) => ({
    name: option.name,
    points: references?.get(routeSlug(option.name))?.points ?? null,
  }))
  const detachmentSpecials = chosen.map((option) => {
    const detail = rules?.detachmentDetails.get(rulesFaction(rules, factionSlug))?.get(routeSlug(option.name))
    return { option, detail, ...describedEnhancements(loaded, data.catalogueId, option, detail) }
  })
  const enhancementDescriptions = new Map(detachmentSpecials.flatMap(({ described }) => [...described]))
  const budget = detachmentPointBudget(data.limit)
  const spent = purchased.reduce((total, option) => total + (option.points ?? 0), 0)
  const upgradeNames = new Set(detachmentSpecials.flatMap(({ detail }) => detail?.upgrades.map((upgrade) => routeSlug(upgrade.name)) ?? []))
  const enhancementNames = new Set(
    detachmentSpecials.flatMap(({ detail, catalogue }) => [
      ...(detail?.enhancements.map((enhancement) => routeSlug(enhancement.name)) ?? []),
      ...(catalogue?.forcedEnhancements.map((enhancement) => routeSlug(enhancement.name)) ?? []),
    ]),
  )
  const detachmentError = detachmentPointsError(purchased, budget)

  const { picked, forceSelections } = rosterForces(loaded, data, detachmentSelection)
  const options = { primaryCatalogueId: data.catalogueId }
  const forces = [...forceSelections.values()]
  const selections = forces.flat()
  const selectionIndex = new Map(selections.map((selection, at) => [selection, at]))
  const keywordIdsByCatalogue = new Map<string, string[][]>()
  const keywordsFor = (catalogueId: string, at: number) => {
    let keywords = keywordIdsByCatalogue.get(catalogueId)
    if (!keywords) {
      keywords = keywordIdsBySelection(selections, loaded.index, { primaryCatalogueId: catalogueId })
      keywordIdsByCatalogue.set(catalogueId, keywords)
    }
    return keywords[at] ?? []
  }
  const whole = evaluateForces(forces, loaded.index, options)
  const selectionPoints = new Map<Selection, number>()
  forces.forEach((force, forceAt) =>
    force.forEach((selection, selectionAt) => selectionPoints.set(selection, whole.selectionPoints[forceAt]?.[selectionAt] ?? 0)),
  )
  const restrictions = rules?.factionRestrictions.get(factionSlug)
  // Keywords and Toughness are only inputs to these two construction rule sets.
  // Projecting every contextual datasheet for an ordinary roster made pricing
  // revisit the complete roster once per unit, despite never reading the result.
  const constructionUnits =
    restrictions || isKotcLimit(data.limit)
      ? picked.map((unit) => {
          const catalogueId = data.units[unit.key]?.catalogueId ?? loaded.index.catalogueOf.get(unit.entryId) ?? data.catalogueId
          const sheet = datasheetIn(loaded, catalogueId, unit.entryId, {
            selections,
            unitSelectionIndex: selectionIndex.get(unit.selection),
            keywordIds: keywordsFor(catalogueId, selectionIndex.get(unit.selection) ?? -1),
          })
          return {
            entryId: unit.entryId,
            name: unit.name,
            keywords: sheet?.keywords ?? [],
            toughness: toughnessOf(sheet?.profiles ?? []),
            warlord: Object.values(data.units[unit.key]?.toggles ?? {}).some((count) => count > 0),
          }
        })
      : []
  /**
   * Units the catalogue builds itself, model for model, per squad size.
   *
   * It offers the player no choice inside them, so a limit broken inside one was
   * broken by the catalogue's own composition rather than by anything a player did
   * or could undo. There is nothing here for a player to act on and nothing worth
   * telling them about.
   *
   * Only what the catalogue puts there by itself, which is why this reads the unit
   * built with no choices at all rather than the one in the list: an enhancement the
   * player picked is inside that unit too, and its own limits are theirs to answer
   * for — two of the same relic in one army is a mistake worth being told about.
   */
  const composedByCatalogue = new Map<string, string>()
  for (const unit of picked) {
    if (modelKindsOf(unit.entryId, unit.selection, loaded.index, options).length) continue
    const composed = buildUnit(unit.entryId, loaded.index, unit.size.models, undefined, {
      primaryCatalogueId: data.catalogueId,
      roster: detachmentSelection,
    })
    if (!composed) continue
    const walk = (node: Selection) => {
      composedByCatalogue.set(node.id, unit.name)
      const definition = loaded.index.definitions.get(node.id)
      if (definition) composedByCatalogue.set(targetOf(definition, loaded.index.definitions).id, unit.name)
      node.selections?.forEach(walk)
    }
    walk(composed.selection)
  }
  const selfContradictory = new Set(whole.errors.filter((error) => isCatalogueSelfContradiction(error, composedByCatalogue)))
  const pickedSelections = data.units.map((_, key) => picked.find((unit) => unit.key === key)?.selection)
  const pickedIndexByKey = new Map(picked.map((unit, at) => [unit.key, at]))
  const attachedByHost = new Map<number, number[]>()
  data.units.forEach((unit, key) => {
    const host = unit.attachedTo ?? key
    attachedByHost.set(host, [...(attachedByHost.get(host) ?? []), key])
  })

  // The 10e catalogue wrapper caps detachments at one; the 11e rules source
  // replaces that constraint with the DP budget checked above.
  const reported = [
    ...whole.errors.filter(
      (error) =>
        !(chosen.length > 1 && error.entryName.toLowerCase().includes('detachment') && error.message.includes('allows at most 1, has ')) &&
        !selfContradictory.has(error),
    ),
    ...attachmentErrors(data.units, loaded.index, pickedSelections),
    ...factionRestrictionViolations(restrictions, constructionUnits),
    ...(isKotcLimit(data.limit) ? kotcViolations(chosen.length, constructionUnits, data.limit) : []),
  ]
  // One fact, said once. A limit on a shared entry is broken by each selection of it,
  // and every one of them reports the same sentence about the same count.
  const errors = reported.filter(
    (error, at) => reported.findIndex((other) => other.entryId === error.entryId && other.message === error.message) === at,
  )

  return {
    revision: loaded.index.revision,
    detachment: chosen[0]?.name ?? null,
    detachments: purchased,
    detachmentPointBudget: budget,
    detachmentPointsSpent: spent,
    detachmentPointsOver: Boolean(detachmentError),
    detachmentError,
    disposition,
    dispositions: allowedDispositions,
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
      const unitSelectionIndex = selectionIndex.get(unit.selection)
      const host = data.units[unit.key]?.attachedTo ?? unit.key
      const companions = (attachedByHost.get(host) ?? []).flatMap((key) => {
        const index = pickedIndexByKey.get(key)
        const companion = index === undefined ? undefined : picked[index]
        const companionSelectionIndex = companion ? selectionIndex.get(companion.selection) : undefined
        return companionSelectionIndex !== undefined && companion !== unit ? [companionSelectionIndex] : []
      })
      const deployment = deploymentRules(
        contextualAbilityNamesIn(loaded, catalogueId, unit.entryId, {
          selections,
          unitSelectionIndex,
          companions,
          keywordIds: unitSelectionIndex === undefined ? [] : keywordsFor(catalogueId, unitSelectionIndex),
        }),
      )
      const describedChoices: ((typeof unit.choices)[number] & { kind?: 'enhancement' | 'upgrade' })[] = unit.choices.map((choice) => {
        const choiceOptions = (choice.options ?? []).map((option) => {
          const path = choice.key.split('/')
          const nested = allAt(unit.selection, [...path, option.id])
          const direct = allAt(unit.selection, path).filter((selection) => selection.id === option.id)
          const selected = nested.length ? nested : direct
          const pieceCounts = optionWargear(option.id, loaded.index, options, selected)
          return pieceCounts.length ? { ...option, pieces: pieceCounts.map((piece) => piece.name), pieceCounts } : option
        })
        if (!choice.name.toLowerCase().includes('enhancement')) return { ...choice, options: choiceOptions }
        const kind = choiceOptions.every((option) => upgradeNames.has(routeSlug(option.name)))
          ? ('upgrade' as const)
          : ('enhancement' as const)
        return {
          ...choice,
          kind,
          options: choiceOptions.map((option) => {
            const description = findEnhancementDescription(enhancementDescriptions, chosen, option.name)
            return { ...option, description, keywordRules: rulesReferencedIn(loaded, [description]) }
          }),
        }
      })
      const catalogued = wargearOf(unit.selection, loaded.index)
      const automaticEnhancements = catalogued.filter((piece) => enhancementNames.has(routeSlug(piece.name))).map((piece) => piece.name)
      const models = modelKindsOf(unit.entryId, unit.selection, loaded.index, options)
      const replacementPairs = legalReplacementPairs(unit.entryId, unit.selection, describedChoices, models, loaded.index, {
        ...options,
        roster: detachmentSelection,
      })
      const choices = describedChoices.map((choice) => ({
        ...choice,
        options: choice.options.map((option) => {
          const replacements = replacementPairs.get(replacementKey({ choiceKey: choice.key, optionId: option.id }))
          return replacements?.length ? { ...option, replacements } : option
        }),
      }))
      const specialChoices = new Set(
        choices
          .filter((choice) => choice.kind)
          .flatMap((choice) => choice.options.filter((option) => option.count > 0).map((option) => routeSlug(option.name))),
      )
      const specialSelections = new Set([...specialChoices, ...automaticEnhancements.map(routeSlug)])
      const wargear = heldWargear(models, choices, catalogued)
      return {
        key: unit.key,
        entryId: unit.entryId,
        name: unit.name,
        points: selectionPoints.get(unit.selection) ?? 0,
        size: {
          min: unit.size.min,
          max: unit.size.max,
          models: unit.size.models,
          options: unit.size.options,
          resizable: unit.size.max > unit.size.min,
        },
        ...deployment,
        choices,
        models,
        toggles: unit.toggles,
        enhancements: uniqueNames([
          ...choices
            .filter((choice) => choice.kind === 'enhancement')
            .flatMap((choice) => choice.options.filter((option) => option.count > 0).map((option) => option.name)),
          ...automaticEnhancements,
        ]),
        upgrades: choices
          .filter((choice) => choice.kind === 'upgrade')
          .flatMap((choice) => choice.options.filter((option) => option.count > 0).map((option) => option.name)),
        wargear: wargear.filter((piece) => !specialSelections.has(routeSlug(piece.name))),
        group: groupOfEntry(loaded.index, unit.entryId),
        attachment: attachmentOf(loaded.index.definitions.get(unit.entryId) ?? { id: unit.entryId }, loaded.index, unit.selection),
      }
    }),
  }
}

export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>()
  return names.filter((name) => {
    const key = routeSlug(name)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

type KotcUnit = { entryId: string; name: string; keywords: readonly string[]; toughness: number | null; warlord: boolean }

export function factionRestrictionViolations(restrictions: FactionRestrictions | undefined, units: readonly KotcUnit[]) {
  if (!restrictions) return []
  return units.flatMap((unit) => {
    const restricted = restrictedBy(restrictions, unit.name, unit.keywords)
    if (!restricted) return []
    return [
      {
        entryId: unit.entryId,
        entryName: unit.name,
        message: `is not allowed in this faction${restricted.keyword ? ` (${restricted.keyword})` : ''}`,
      },
    ]
  })
}

/** Prototype KOTC 2.0 army-construction changes layered over normal Incursion legality. */
export function kotcViolations(detachments: number, units: readonly KotcUnit[], limit = 600) {
  const errors: { entryId: string; entryName: string; message: string }[] = []
  const add = (message: string, unit?: KotcUnit) =>
    errors.push({ entryId: unit?.entryId ?? 'kotc', entryName: unit?.name ?? 'King of the Colosseum', message })
  if (detachments !== 1) add(`needs exactly 1 detachment, has ${detachments}`)
  if (units.filter((unit) => hasKeyword(unit, 'infantry')).length < 2) add('needs at least 2 Infantry units')
  if (!units.some((unit) => unit.warlord)) add('needs a Warlord')
  for (const unit of units) {
    for (const message of kotcUnitExclusions(unit)) add(message, unit)
    if (unit.toughness === null) add('cannot verify its Toughness from the synced catalogue', unit)
  }
  const toughnessNine = units.filter((unit) => unit.toughness === 9)
  if (toughnessNine.length > 1) add(`allows at most 1 Toughness 9 unit, has ${toughnessNine.length}`)
  const byDatasheet = new Map<string, KotcUnit[]>()
  for (const unit of units) byDatasheet.set(unit.entryId, [...(byDatasheet.get(unit.entryId) ?? []), unit])
  for (const copies of byDatasheet.values()) {
    const allowance = formatDatasheetLimit(
      limit,
      copies.some((unit) => kotcDatasheetRepeatable(unit.keywords)),
    )!
    if (copies.length > allowance) add(`allows at most ${allowance} of this datasheet, has ${copies.length}`, copies[0])
  }
  return errors
}

/**
 * Whether a limit was broken by the catalogue building a unit rather than by a
 * player. Only ever true inside a unit the catalogue composes itself, and only for
 * a limit being exceeded: anything else is still the player's to answer for.
 */
export function isCatalogueSelfContradiction(
  error: { entryId: string; message: string },
  composedByCatalogue: ReadonlyMap<string, string>,
) {
  return composedByCatalogue.has(error.entryId) && error.message.startsWith('allows at most ')
}

const hasKeyword = (unit: KotcUnit, keyword: string) => unit.keywords.some((candidate) => candidate.trim().toLocaleLowerCase() === keyword)

/**
 * What a unit is carrying, counted the way its loadout is drawn.
 *
 * The roster card and the loadout panel answer the same question, so they read the
 * same fold. Anything the model kinds never mention — an enhancement, a choice that
 * belongs to the unit rather than to one of its models — is still the catalogue's to
 * report, and is carried through untouched.
 */
export function heldWargear(
  models: readonly ModelKind[],
  choices: readonly {
    key: string
    name?: string
    options: readonly { id: string; name?: string; count: number; pieceCounts?: readonly { name: string; count: number }[] }[]
  }[],
  catalogued: readonly { name: string; count: number }[],
): { name: string; count: number }[] {
  if (!models.length) return [...catalogued]
  const countOf = (choiceKey: string, optionId: string) =>
    choices.find((choice) => choice.key === choiceKey)?.options.find((option) => option.id === optionId)?.count ?? 0
  const held = new Map<string, { name: string; count: number }>()
  const named = new Set<string>()
  const add = (name: string, count: number) => {
    const key = wargearKey(name)
    named.add(key)
    if (count <= 0) return
    const seen = held.get(key)
    if (seen) seen.count += count
    else held.set(key, { name, count })
  }

  for (const kind of models) {
    const bodies = kind.members.reduce(
      (total, member) => total + (member.choiceKey ? countOf(member.choiceKey, member.id) : member.baseCount),
      0,
    )
    for (const piece of kind.fixed) add(piece.name, piece.count ?? bodies)
    for (const row of kind.rows) {
      const count = modelRowCount(row, ({ choiceKey, optionId }) => countOf(choiceKey, optionId))
      for (const name of row.pieces ?? [row.name]) add(name, count)
    }
  }
  const modeled = new Set(
    models.flatMap((kind) => [
      ...kind.members.flatMap((member) => (member.choiceKey ? [replacementKey({ choiceKey: member.choiceKey, optionId: member.id })] : [])),
      ...kind.rows.flatMap((row) => modelRowSources(row).map(replacementKey)),
    ]),
  )
  for (const choice of choices) {
    if (choice.name && isUnitCompositionChoice({ name: choice.name })) continue
    for (const option of choice.options) {
      if (option.count <= 0 || modeled.has(replacementKey({ choiceKey: choice.key, optionId: option.id }))) continue
      const pieces = option.pieceCounts ?? (option.name ? [{ name: option.name, count: option.count }] : [])
      for (const piece of pieces) add(piece.name, piece.count)
    }
  }
  for (const piece of catalogued) {
    const key = wargearKey(piece.name)
    if (!named.has(key)) add(piece.name, piece.count)
  }
  return [...held.values()]
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
) => detachments.map((detachment) => descriptions.get(descriptionKey(detachment.name, enhancement))).find(Boolean) ?? null

export function resolveDisposition(allowed: readonly string[], selected: string | null) {
  const disposition = allowed.includes(selected ?? '') ? selected : allowed.length === 1 ? allowed[0] : null
  return { disposition, error: allowed.length > 1 && !disposition ? 'Pick a disposition.' : null }
}
