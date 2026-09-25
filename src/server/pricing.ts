import { attachmentCategoriesOf, attachmentErrors, attachmentLimitsOf, attachmentOf } from '../core/attach'
import { routeSlug } from '../core/slug'
import { borrowedDispositionError, detachmentPointBudget, detachmentPointsError, isKotcLimit } from '../core/battle'
import { type CatalogueIndex, targetOf } from '../core/catalogue'
import {
  battleSizeSelection,
  ENHANCEMENT_COST,
  enhancementLimit,
  evaluate,
  evaluateForces,
  keywordIdsBySelection,
  type Selection,
} from '../core/evaluate'
import { type ModelKind, modelKindsOf, modelRowSources, choiceOptionWargear } from '../core/modelKinds'
import { type LabelUnit, rosterLabel } from '../core/rosterLabel'
import { buildUnit } from '../core/roster'
import { type ChoiceOptions, type UnitChoice, unitChoices } from '../core/unitChoices'
import { withUnitSpread } from '../core/unitSpread'
import { wargearOf } from '../core/wargear'
import { app } from './app'
import { contextualAbilityNamesIn, datasheetIn, matchesKeywordSelector, rulesReferencedIn, toughnessOf } from './catalogue'
import { describedEnhancements } from './catalogueDescriptions'
import { descriptionKey } from './datacards'
import { factionDisplayName } from './factionNames'
import { detachmentNamed } from './factionReferences'
import { groupOfEntry } from './cataloguePicker'
import { rosterDetachments } from './rosterDetachments'
import { deploymentRules, grantsStrategicReserveExemption, strategicReserveExemptionSelectors } from './rosterDeployment'
import { heldWargear, replacementKey, type ReplacementSource } from './heldWargear'
import { factionRestrictionViolations, isCatalogueSelfContradiction, kotcViolations } from './formatRestrictions'
import { type LoadedCatalogue } from './catalogueIndex'
import { type LoadedRules, rulesFaction } from './rules'
import type { PriceInput } from './schemas'

export { rosterDetachments }
export { heldWargear } from './heldWargear'
export { deploymentRules, grantsStrategicReserveExemption, strategicReserveExemptionSelectors } from './rosterDeployment'
export { factionRestrictionViolations, isCatalogueSelfContradiction, kotcViolations } from './formatRestrictions'

/**
 * A list as the catalogue reads it: every pick expanded, grouped by the book it
 * came from.
 *
 * Pulled out because the whole price and the points alone both start here, and a
 * library row and the editor showing different totals for one list would be the
 * plainest possible version of the same question answered twice.
 */
function rosterForces(loaded: LoadedCatalogue, data: PriceInput, detachmentSelection: readonly Selection[]) {
  // Every force says which battle size it is, because the caps conditioned on it are
  // written for the largest game and lowered from there. An ally sits in a force of
  // its own and asks the same question, and the answer has to be in there with it —
  // but only once per force, because the roster may hold one battle size in all.
  const battleSize = battleSizeSelection(loaded.index, data.limit)
  const configuration = battleSize ? [battleSize] : []
  const roster = [...configuration, ...detachmentSelection]
  const picked = data.units.flatMap((wanted, key) => {
    const built = buildUnit(wanted.entryId, loaded.index, wanted.models, wanted.choices, {
      primaryCatalogueId: data.catalogueId,
      mustering: true,
      roster,
      spreads: wanted.spreads,
      toggles: wanted.toggles,
    })
    const entry = loaded.index.definitions.get(wanted.entryId)
    return built ? [{ key, entryId: wanted.entryId, name: entry?.name ?? wanted.entryId, ...built }] : []
  })
  const forceSelections = new Map<string, Selection[]>([[data.catalogueId, [...roster]]])
  for (const unit of picked) {
    const owner = data.units[unit.key]?.catalogueId ?? loaded.index.catalogueOf.get(unit.entryId) ?? data.catalogueId
    const force = forceSelections.get(owner) ?? [...configuration]
    force.push(unit.selection)
    forceSelections.set(owner, force)
  }
  return { picked, forceSelections, roster }
}

type ReplacementChoice = {
  key: string
  options: readonly { id: string; count: number; max: number }[]
}

/** A malformed catalogue choice must not make the whole roster impossible to price. */
export const choiceOptionsForPricing = (choice: { options?: UnitChoice['options'] }) => choice.options ?? []

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
    for (const [key, counts] of wanted) candidate = withUnitSpread(candidate, key, counts, index, options)
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
/**
 * What each pick is called, what it cost, and whether it is the Warlord.
 *
 * The three facts `rosterLabel` folds a name out of. Gathered here because the
 * library's cheap total and the builder's whole price both hand them over, and a
 * library row and the editor suggesting different names for one list would be the
 * plainest possible version of the same question answered twice.
 */
function labelUnitsOf(
  picked: readonly { key: number; name: string; selection: Selection }[],
  pointsBySelection: ReadonlyMap<Selection, number>,
  data: PriceInput,
): LabelUnit[] {
  return picked.map((unit) => ({
    name: unit.name,
    points: pointsBySelection.get(unit.selection) ?? 0,
    warlord: Object.values(data.units[unit.key]?.toggles ?? {}).some((count) => count > 0),
  }))
}

const factionNameOf = (loaded: LoadedCatalogue, catalogueId: string, rules: LoadedRules | null | undefined) =>
  factionDisplayName(loaded.index.catalogues.get(catalogueId)?.name ?? '', rules?.factionNames)

/**
 * The label a list falls back on, from its setup alone.
 *
 * No units, so no pricing: enough for a search result or a library row that has not
 * had its totals answered yet, and the same fold either way.
 */
export function rosterSetupLabel(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null | undefined,
  roster: { catalogueId: string; detachmentIds: readonly string[]; limit: number },
) {
  const { chosen } = rosterDetachments(loaded, roster.catalogueId, roster.detachmentIds)
  return rosterLabel({
    factionName: factionNameOf(loaded, roster.catalogueId, rules),
    detachmentNames: chosen.map((option) => option.name),
    limit: roster.limit,
  })
}

/**
 * A list's total and the name it falls back on, which come out of one fold.
 *
 * The library asks for both at once: a row shows a points total and, for a list its
 * owner never named, the label instead of an empty line. Pricing every unit twice to
 * answer two halves of one question would double the cost of opening the library.
 */
export function calculateRosterTotals(data: PriceInput, loaded = app().catalogue(), loadedRules = app().rules()) {
  if (!loaded) return null
  const { chosen, selections: detachmentSelection } = rosterDetachments(loaded, data.catalogueId, data.detachmentIds)
  const { picked, forceSelections } = rosterForces(loaded, data, detachmentSelection)
  const forces = [...forceSelections.values()]
  const evaluated = evaluateForces(forces, loaded.index, { primaryCatalogueId: data.catalogueId })
  const pointsBySelection = new Map<Selection, number>()
  forces.forEach((force, forceAt) =>
    force.forEach((selection, at) => pointsBySelection.set(selection, evaluated.selectionPoints[forceAt]?.[at] ?? 0)),
  )
  return {
    points: evaluated.points,
    label: rosterLabel({
      factionName: factionNameOf(loaded, data.catalogueId, loadedRules),
      detachmentNames: chosen.map((option) => option.name),
      limit: data.limit,
      units: labelUnitsOf(picked, pointsBySelection, data),
    }),
  }
}

/**
 * What a saved list is priced as, built in one place.
 *
 * Every field here changes what the price is allowed to answer, so a caller that
 * assembles its own literal can silently drop one: a missing borrow leaves the
 * borrowed disposition out of the allowed set, and `resolveDisposition` then
 * substitutes the roster's own without reporting anything. Callers pass the saved
 * list, not a shape they built themselves.
 */
export function savedRosterPriceInput(saved: {
  catalogueId: string
  detachmentIds: readonly string[]
  disposition: string | null
  limit: number
  picks: PriceInput['units']
  waivedRules?: PriceInput['waivedRules']
  optionalRules?: PriceInput['optionalRules']
  borrowedDetachmentId?: string | null
}): PriceInput {
  return {
    catalogueId: saved.catalogueId,
    detachmentIds: [...saved.detachmentIds],
    disposition: saved.disposition,
    borrowedDetachmentId: saved.borrowedDetachmentId ?? null,
    limit: saved.limit,
    units: saved.picks,
    waivedRules: saved.waivedRules,
    optionalRules: saved.optionalRules,
  }
}

export function calculateRosterPrice(data: PriceInput, loaded = app().catalogue(), loadedRules = app().rules()) {
  if (!loaded) return null

  const { chosen, selections: detachmentSelection } = rosterDetachments(loaded, data.catalogueId, data.detachmentIds)
  // Enhancements and unit limits can depend on the detachment already being in
  // the roster when units are expanded.
  const rules = loadedRules
  const factionSlug = routeSlug(loaded.index.catalogues.get(data.catalogueId)?.name ?? '')
  const factionName = factionNameOf(loaded, data.catalogueId, rules)
  const rulesId = rulesFaction(rules, factionSlug)
  const references = rules?.detachmentReferences.get(rulesId)
  const details = rules?.detachmentDetails.get(rulesId)
  const allowedDispositions = [
    ...new Set(
      chosen.flatMap((option) => {
        const reference = detachmentNamed(references, option.name)
        return reference ? reference.dispositions : option.disposition ? [option.disposition] : []
      }),
    ),
  ]
  const purchased = chosen.map((option) => ({
    name: option.name,
    points: detachmentNamed(references, option.name)?.points ?? null,
  }))
  // The King of the Colosseum optional rule. The borrowed detachment is never added to the
  // roster, so it brings no rules, enhancements or stratagems: it sells its Force
  // Disposition and nothing else, for the detachment points this roster left unspent. An
  // unaffordable or unpriced borrow grants nothing, so an illegal list cannot quietly
  // play a mission matchup it did not pay for.
  const borrowedDetachment = data.borrowedDetachmentId
    ? (rosterDetachments(loaded, data.catalogueId, [data.borrowedDetachmentId]).chosen[0] ?? null)
    : null
  const borrowedReference = borrowedDetachment ? detachmentNamed(references, borrowedDetachment.name) : undefined
  const ownPoints = purchased.some((option) => option.points === null)
    ? null
    : purchased.reduce((total, option) => total + (option.points ?? 0), 0)
  const borrowedError = borrowedDispositionError(
    data.limit,
    data.optionalRules,
    { points: ownPoints },
    data.borrowedDetachmentId ? { points: borrowedReference?.points ?? null } : null,
  )
  const borrowedDispositions =
    borrowedError || !borrowedDetachment
      ? []
      : (borrowedReference?.dispositions ?? (borrowedDetachment.disposition ? [borrowedDetachment.disposition] : []))
  const { disposition, error: dispositionError } = resolveDisposition([...allowedDispositions, ...borrowedDispositions], data.disposition)
  const detachmentSpecials = chosen.map((option) => {
    const detail = detachmentNamed(details, option.name)
    return { option, detail, ...describedEnhancements(loaded, data.catalogueId, option, detail) }
  })
  const strategicReserveFactsComplete =
    Boolean(rules) &&
    detachmentSpecials.every(({ option, detail, catalogue, described }) => {
      if (!detail || detail.rules.some((rule) => !rule.description)) return false
      const offered = [...detail.enhancements, ...detail.upgrades]
      return (
        offered.every((enhancement) => described.has(descriptionKey(option.name, enhancement.name))) &&
        (catalogue?.forcedEnhancements ?? []).every((enhancement) => Boolean(enhancement.description))
      )
    })
  const reserveExemptionSelectors = strategicReserveExemptionSelectors(
    detachmentSpecials.flatMap(({ detail }) => detail?.rules.map((rule) => rule.description) ?? []),
  )
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
  const detachmentError = detachmentPointsError(purchased, budget, data.waivedRules)

  const { picked, forceSelections, roster } = rosterForces(loaded, data, detachmentSelection)
  // Pricing is a roster being mustered, which is what a datasheet's force-scoped rules ask about.
  const options = { primaryCatalogueId: data.catalogueId, mustering: true }
  const forces = [...forceSelections.values()]
  const selections = forces.flat()
  const selectionIndex = new Map(selections.map((selection, at) => [selection, at]))
  const keywordIdsByCatalogue = new Map<string, string[][]>()
  const keywordMatrixFor = (catalogueId: string) => {
    let keywords = keywordIdsByCatalogue.get(catalogueId)
    if (!keywords) {
      keywords = keywordIdsBySelection(selections, loaded.index, { primaryCatalogueId: catalogueId })
      keywordIdsByCatalogue.set(catalogueId, keywords)
    }
    return keywords
  }
  const keywordsFor = (catalogueId: string, at: number) => keywordMatrixFor(catalogueId)[at] ?? []
  // Model kinds are the dear part of a unit's projection, and the price reads them
  // twice: once to find units the catalogue composes itself, and once to draw each
  // unit's card. Project each unit once and keep the result for the request.
  const modelKindsByUnit = new Map<(typeof picked)[number], ModelKind[]>()
  const modelKindsFor = (unit: (typeof picked)[number]) => {
    let kinds = modelKindsByUnit.get(unit)
    if (!kinds) {
      kinds = modelKindsOf(unit.entryId, unit.selection, loaded.index, options)
      modelKindsByUnit.set(unit, kinds)
    }
    return kinds
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
          const pick = data.units[unit.key]
          return {
            entryId: unit.entryId,
            name: unit.name,
            keywords: sheet?.keywords ?? [],
            toughness: toughnessOf(sheet?.profiles ?? []),
            warlord: Object.values(pick?.toggles ?? {}).some((count) => count > 0),
            // What list building could still raise a Toughness by, which the snapshot
            // never says: enhancements arrive as an ability reference with no text, and
            // leader attachments record eligibility only.
            enhanced: Object.values(pick?.choices ?? {}).some((choice) => enhancementNames.has(routeSlug(choice))),
            led: data.units.some((other) => other.attachedTo === unit.key),
          }
        })
      : []
  /** Ignore limits broken inside a unit with no player choices; never suppress a limit on the unit itself or on a player-selected upgrade. */
  const composedByCatalogue = new Map<string, string>()
  for (const unit of picked) {
    if (modelKindsFor(unit).length) continue
    const composed = buildUnit(unit.entryId, loaded.index, unit.size.models, undefined, {
      primaryCatalogueId: data.catalogueId,
      mustering: true,
      roster,
    })
    if (!composed) continue
    const walk = (node: Selection) => {
      composedByCatalogue.set(node.id, unit.name)
      const definition = loaded.index.definitions.get(node.id)
      if (definition) composedByCatalogue.set(targetOf(definition, loaded.index.definitions).id, unit.name)
      node.selections?.forEach(walk)
    }
    composed.selection.selections?.forEach(walk)
  }
  const selfContradictory = new Set(whole.errors.filter((error) => isCatalogueSelfContradiction(error, composedByCatalogue)))
  const pickedSelections = data.units.map((_, key) => picked.find((unit) => unit.key === key)?.selection)
  const pickedIndexByKey = new Map(picked.map((unit, at) => [unit.key, at]))
  const attachedByHost = new Map<number, number[]>()
  data.units.forEach((unit, key) => {
    const host = unit.attachedTo ?? key
    attachedByHost.set(host, [...(attachedByHost.get(host) ?? []), key])
  })

  /*
   * The enhancements an army may hold, which its battle size sets for the whole army
   * rather than for anything in it. The count is the data's own: a second copy of an
   * upgrade costs no enhancement, so the army's total already excludes it.
   */
  const enhancementsAllowed = enhancementLimit(loaded.index, forces, options)
  const enhancementsHeld = whole.costs[ENHANCEMENT_COST] ?? 0
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
    ...(isKotcLimit(data.limit) ? kotcViolations(chosen.length, constructionUnits, data.limit, data.waivedRules) : []),
    ...(enhancementsAllowed !== null && enhancementsHeld > enhancementsAllowed
      ? [
          {
            entryId: 'enhancements',
            entryName: 'Enhancements',
            message: `allow at most ${enhancementsAllowed} in an army, has ${enhancementsHeld}`,
          },
        ]
      : []),
  ]
  // One fact, said once. A limit on a shared entry is broken by each selection of it,
  // and every one of them reports the same sentence about the same count.
  const errors = reported.filter(
    (error, at) => reported.findIndex((other) => other.entryId === error.entryId && other.message === error.message) === at,
  )

  return {
    revision: loaded.index.revision,
    // Folded here rather than in the browser so a battle snapshot, a library row and
    // the field's own placeholder all read the one answer.
    label: rosterLabel({
      factionName,
      detachmentNames: chosen.map((option) => option.name),
      limit: data.limit,
      units: labelUnitsOf(picked, selectionPoints, data),
    }),
    detachment: chosen[0]?.name ?? null,
    detachments: purchased,
    detachmentPointBudget: budget,
    detachmentPointsSpent: spent,
    detachmentPointsOver: Boolean(detachmentError),
    detachmentError,
    disposition,
    dispositions: [...allowedDispositions, ...borrowedDispositions],
    dispositionError,
    borrowedDetachment: borrowedDetachment?.name ?? null,
    borrowedError,
    strategicReserveFactsComplete,
    points: whole.points,
    errors,
    unhandled: [
      ...whole.unhandled,
      ...(forceSelections.size > 1 ? ['allied-force eligibility is not present in the synced catalogue data'] : []),
    ],
    selections,
    units: picked.map((unit) => {
      const catalogueId = data.units[unit.key]?.catalogueId ?? loaded.index.catalogueOf.get(unit.entryId) ?? data.catalogueId
      const definition = loaded.index.definitions.get(unit.entryId) ?? { id: unit.entryId }
      const unitSelectionIndex = selectionIndex.get(unit.selection)
      const keywordNames = (unitSelectionIndex === undefined ? [] : keywordsFor(catalogueId, unitSelectionIndex)).flatMap((id) => {
        const category = loaded.index.categories.get(id)
        return category?.hidden || !category?.name ? [] : [category.name.replace(/^Faction:\s*/iu, '')]
      })
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
          rosterKeywordIds: keywordMatrixFor(catalogueId),
        }),
      )
      const describedChoices: ((typeof unit.choices)[number] & { kind?: 'enhancement' | 'upgrade' })[] = unit.choices.map((choice) => {
        const choiceOptions = choiceOptionsForPricing(choice).map((option) => {
          const pieceCounts = choiceOptionWargear(choice.key, option.id, unit.selection, loaded.index, options)
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
      const models = modelKindsFor(unit)
      const replacementPairs = legalReplacementPairs(unit.entryId, unit.selection, describedChoices, models, loaded.index, {
        ...options,
        roster,
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
      const selectedEnhancements = uniqueNames([
        ...choices
          .filter((choice) => choice.kind === 'enhancement')
          .flatMap((choice) => choice.options.filter((option) => option.count > 0).map((option) => option.name)),
        ...automaticEnhancements,
      ])
      const specialSelections = new Set([...specialChoices, ...automaticEnhancements.map(routeSlug)])
      const strategicReserveExempt =
        reserveExemptionSelectors.some((selector) => matchesKeywordSelector(selector, keywordNames)) ||
        selectedEnhancements.some((enhancement) =>
          grantsStrategicReserveExemption(findEnhancementDescription(enhancementDescriptions, chosen, enhancement)),
        )
      const wargear = heldWargear(models, choices, catalogued)
      const attachment = attachmentOf(definition, loaded.index, unit.selection)
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
        ...(strategicReserveExempt ? { strategicReserveExempt: true } : {}),
        choices,
        models,
        toggles: unit.toggles,
        enhancements: selectedEnhancements,
        upgrades: choices
          .filter((choice) => choice.kind === 'upgrade')
          .flatMap((choice) => choice.options.filter((option) => option.count > 0).map((option) => option.name)),
        wargear: wargear.filter((piece) => !specialSelections.has(routeSlug(piece.name))),
        group: groupOfEntry(loaded.index, unit.entryId),
        attachment,
        attachmentLimits: attachmentLimitsOf(definition, loaded.index),
        attachmentCategories: attachment ? attachmentCategoriesOf(definition, loaded.index) : [],
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

export const findEnhancementDescription = (
  descriptions: ReadonlyMap<string, string>,
  detachments: readonly { name: string }[],
  enhancement: string,
) => detachments.map((detachment) => descriptions.get(descriptionKey(detachment.name, enhancement))).find(Boolean) ?? null

export function resolveDisposition(allowed: readonly string[], selected: string | null) {
  const disposition = allowed.includes(selected ?? '') ? selected : allowed.length === 1 ? allowed[0] : null
  return { disposition, error: allowed.length > 1 && !disposition ? 'Pick a disposition.' : null }
}
