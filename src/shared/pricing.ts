import { groupBy, RecentlyUsed, uniqueBy, remember } from '../core/collections'
import { attachmentErrors, attachmentPartyOf } from '../core/attach'
import { attachmentHost } from '../core/attachedUnits'
import { routeSlug } from '../core/slug'
import { borrowedDispositionError, detachmentPointBudget, detachmentPointsError, enforces, isKotcLimit } from '../core/battle'
import { type CatalogueIndex, targetOf } from '../core/catalogue'
import {
  battleSizeSelection,
  ENHANCEMENT_COST,
  enhancementLimit,
  evaluate,
  evaluateForces,
  keywordNames,
  keywordsBySelection,
  pointCapErrors,
  type Selection,
} from '../core/evaluate'
import { type ModelKind, modelKindsOf, modelRowSources, choiceOptionWargear, ownChoiceOptionWargear } from '../core/modelKinds'
import { type LabelUnit, rosterLabel } from '../core/rosterLabel'
import { buildUnit, type BuiltUnit, resolveUnitChoice } from '../core/roster'
import { unavailableRosterSelections } from '../core/rosterSelections'
import { type ChoiceOptions, hasWarlordToggle, type UnitChoice, unitChoices } from '../core/unitChoices'
import { withUnitSpread } from '../core/unitSpread'
import { wargearOf } from '../core/wargear'
import { rulesReferencedIn } from './catalogueRules'
import { contextualAbilityNamesIn, datasheetIn, toughnessOf } from './catalogue'
import { matchesKeywordSelector } from '../core/keywords'
import { describedEnhancements } from './catalogueDescriptions'
import { descriptionKey } from './datacards'
import { factionDisplayName } from './factionNames'
import { detachmentNamed } from './factionReferences'
import { contextualUnitLimit, detachmentsUnlocking, shelfIn, unitIdsIn } from './cataloguePicker'
import { isDetachmentWrapperLimit, rosterDetachments } from './rosterDetachments'
import { detachmentPoints } from './detachmentPoints'
import { choiceOptionsForPricing, mfmOptionAdjustment, mfmOptionPoints, mfmUnitFor, unitPointAdjustment } from './unitPoints'
import { isUpgrade, mfmDetachmentFor, withoutUpgrade } from './mfm'
import { deploymentRules } from './rosterDeployment'
import { grantsReserveExemptionIn, reserveSelectorsIn } from './textFacts'
import { heldWargear, replacementKey, type ReplacementSource } from './heldWargear'
import { factionRestrictionViolations, isCatalogueSelfContradiction, kotcViolations, warlordCountProblem } from './formatRestrictions'
import type { LoadedCatalogue } from './catalogueIndex'
import { type LoadedRules, rulesFaction } from './rules'
import type { PriceInput } from '../contracts/schemas'

/** A built unit depends only on its pick, the battle size and the detachments, so every price on one catalogue shares it. */
const sharedBuiltUnits = new WeakMap<LoadedCatalogue, Map<string, BuiltUnit | null>>()
const sharedBuiltUnitsFor = (loaded: LoadedCatalogue) =>
  remember(sharedBuiltUnits, loaded, () => new RecentlyUsed<string, BuiltUnit | null>(2_000))

/** Projections of one built unit, kept for as long as the unit itself is. */
const builtModelKinds = new WeakMap<BuiltUnit, ModelKind[]>()
const builtAttachments = new WeakMap<BuiltUnit, ReturnType<typeof attachmentPartyOf>>()

/**
 * A list as the catalogue reads it: every pick expanded, grouped by the book it
 * came from. The whole price and the points alone both start here, so a library row
 * and the editor cannot disagree on a total.
 */
function rosterForces(
  loaded: LoadedCatalogue,
  data: PriceInput,
  detachmentSelection: readonly Selection[],
  unitCache?: Map<string, BuiltUnit | null>,
) {
  // Every force says which battle size it is, because the caps conditioned on it are
  // written for the largest game and lowered from there. An ally sits in a force of
  // its own and asks the same question, and the answer has to be in there with it —
  // but only once per force, because the roster may hold one battle size in all.
  const battleSize = battleSizeSelection(loaded.index, data.limit)
  const configuration = battleSize ? [battleSize] : []
  const roster = [...configuration, ...detachmentSelection]
  const rosterKey = unitCache && JSON.stringify([loaded.index.revision, data.catalogueId, roster])
  const picked = data.units.flatMap((wanted, key) => {
    const cacheKey = rosterKey && `${rosterKey}${JSON.stringify(wanted)}`
    let built = cacheKey ? unitCache?.get(cacheKey) : undefined
    if (built === undefined) {
      built = buildUnit(wanted.entryId, loaded.index, wanted.models, wanted.choices, {
        primaryCatalogueId: data.catalogueId,
        mustering: true,
        roster,
        spreads: wanted.spreads,
        toggles: wanted.toggles,
      })
      if (cacheKey) unitCache?.set(cacheKey, built)
    }
    if (!built) return []
    const source = built
    // Repeated picks need distinct top-level identities for contextual evaluation.
    if (unitCache) built = { ...built, selection: { ...built.selection } }
    const entry = loaded.index.definitions.get(wanted.entryId)
    return [{ key, entryId: wanted.entryId, name: entry?.name ?? wanted.entryId, source, ...built }]
  })
  const forceSelections = new Map<string, Selection[]>([[data.catalogueId, [...roster]]])
  for (const unit of picked) {
    const owner = unitCatalogueId(loaded, data, unit)
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
 * The Warlord is asked of a list once something in it could be one. A list of squads alone, or an empty one kept to
 * track a game, has nothing the Warlord choice could fix.
 */
function armyWarlordErrors(picked: readonly { toggles: BuiltUnit['toggles'] }[]) {
  if (!picked.some((unit) => unit.toggles.some((toggle) => toggle.name === 'Warlord'))) return []
  const problem = warlordCountProblem(picked.filter((unit) => hasWarlordToggle(unit.toggles)).length)
  return problem ? [{ entryId: 'warlord', entryName: 'Army', message: problem }] : []
}

/** Units the chosen detachments do not offer, such as Deathwatch in a chapter army without Deathwatch Support. */
function detachmentLockErrors(
  loaded: LoadedCatalogue,
  data: PriceInput,
  picked: ReturnType<typeof rosterForces>['picked'],
  roster: readonly Selection[],
) {
  return picked.flatMap((unit) => {
    if (data.units[unit.key]?.catalogueId) return []
    const offeredBy = detachmentsUnlocking(loaded, data.catalogueId, unit.entryId, roster)
    if (!offeredBy) return []
    const message = offeredBy.length ? `needs the ${offeredBy.join(' or ')} detachment` : 'is not available with the chosen detachments'
    return [{ entryId: unit.entryId, entryName: unit.name, message }]
  })
}

/**
 * What each pick is called, what it cost, and whether it is the Warlord.
 *
 * The three facts `rosterLabel` folds a name out of. Gathered here because the
 * library's cheap total and the builder's whole price both hand them over, and a
 * library row and the editor suggesting different names for one list would be the
 * plainest possible version of the same question answered twice.
 */
function labelUnitsOf(
  picked: readonly { name: string; selection: Selection; toggles: BuiltUnit['toggles'] }[],
  pointsBySelection: ReadonlyMap<Selection, number>,
): LabelUnit[] {
  return picked.map((unit) => ({
    name: unit.name,
    points: pointsBySelection.get(unit.selection) ?? 0,
    warlord: hasWarlordToggle(unit.toggles),
  }))
}

type PickedUnit = { key: number; entryId: string }

/** The book a picked unit is drawn from: the one the pick names, else the one defining it, else the roster's own. */
const unitCatalogueId = (loaded: LoadedCatalogue, data: PriceInput, unit: PickedUnit) =>
  data.units[unit.key]?.catalogueId ?? loaded.index.catalogueOf.get(unit.entryId) ?? data.catalogueId

const pickedMfmUnit = (loaded: LoadedCatalogue, data: PriceInput, unit: PickedUnit) =>
  mfmUnitFor(loaded, data.units[unit.key]?.catalogueId ?? data.catalogueId, unit.entryId)

function selectionPointsOf(forces: readonly (readonly Selection[])[], evaluated: { selectionPoints: readonly (readonly number[])[] }) {
  const points = new Map<Selection, number>()
  forces.forEach((force, forceAt) => force.forEach((selection, at) => points.set(selection, evaluated.selectionPoints[forceAt]?.[at] ?? 0)))
  return points
}

function adjustUnitPoints(
  loaded: LoadedCatalogue,
  data: PriceInput,
  picked: ReturnType<typeof rosterForces>['picked'],
  pointsBySelection: Map<Selection, number>,
) {
  let adjustment = 0
  const copies = new Map<string, number>()
  const detachments = rosterDetachments(loaded, data.catalogueId, data.detachmentIds).chosen.flatMap(
    (option) => mfmDetachmentFor(loaded, data.catalogueId, option.name) ?? [],
  )
  for (const unit of picked) {
    const catalogueId = unitCatalogueId(loaded, data, unit)
    const definition = loaded.index.definitions.get(unit.entryId)
    const sheetId = definition ? targetOf(definition, loaded.index.definitions).id : unit.entryId
    const copy = (copies.get(sheetId) ?? 0) + 1
    copies.set(sheetId, copy)
    const mfmUnit = pickedMfmUnit(loaded, data, unit)
    const optionDifference = mfmOptionAdjustment(loaded.index, unit, mfmUnit, detachments, {
      primaryCatalogueId: data.catalogueId,
      mustering: true,
    })
    const difference = unitPointAdjustment(loaded, data.catalogueId, catalogueId, unit.entryId, unit.size.models, copy) + optionDifference
    pointsBySelection.set(unit.selection, (pointsBySelection.get(unit.selection) ?? 0) + difference)
    adjustment += difference
  }
  return adjustment
}

function savedSelectionErrors(data: PriceInput, picked: ReturnType<typeof rosterForces>['picked'], loaded: LoadedCatalogue) {
  const byKey = new Map(picked.map((unit) => [unit.key, unit]))
  const problems = selectionProblems(data, picked, loaded)
  const unavailable = new Set(problems.map((problem) => problem.pickIndex))
  return data.units.flatMap((saved, key) => {
    const unit = byKey.get(key)
    if (!unit)
      return [
        {
          entryId: saved.entryId,
          entryName: saved.entryId,
          message: 'this saved datasheet is no longer available; choose a current unit',
        },
      ]
    // Errors are said once per datasheet, so each carries what every copy needs reset.
    return unavailable.has(key)
      ? [
          {
            entryId: saved.entryId,
            entryName: unit.name,
            message: 'a saved choice is no longer available; reselect this unit’s options',
            unavailable: problems.filter((problem) => problem.entryId === saved.entryId),
          },
        ]
      : []
  })
}

function selectionProblems(data: PriceInput, picked: ReturnType<typeof rosterForces>['picked'], loaded: LoadedCatalogue) {
  const byKey = new Map(picked.map((unit) => [unit.key, unit]))
  return unavailableRosterSelections(data.units, picked, (key, choiceKey, optionId) => {
    const unit = byKey.get(key)
    return unit?.size.options?.length ? resolveUnitChoice(unit.selection, choiceKey, optionId, loaded.index) : null
  })
}

export function unavailablePriceSelections(data: PriceInput, loaded: LoadedCatalogue | null) {
  if (!loaded) return unavailableRosterSelections(data.units, [])
  const { selections } = rosterDetachments(loaded, data.catalogueId, data.detachmentIds)
  return selectionProblems(data, rosterForces(loaded, data, selections).picked, loaded)
}

const factionNameOf = (loaded: LoadedCatalogue, catalogueId: string, rules: Pick<LoadedRules, 'factionNames'> | null | undefined) =>
  factionDisplayName(loaded.index.catalogues.get(catalogueId)?.name ?? '', rules?.factionNames)

/**
 * A list's total and display name. Saved names need no new label; legacy unnamed
 * rows get one from the same evaluated units used to total their points.
 */
export function calculateRosterTotals(
  data: PriceInput,
  loaded: LoadedCatalogue | null,
  loadedRules: Pick<LoadedRules, 'factionNames'> | null,
  storedName = '',
) {
  if (!loaded) return null
  const { chosen, selections: detachmentSelection } = rosterDetachments(loaded, data.catalogueId, data.detachmentIds)
  const { picked, forceSelections } = rosterForces(loaded, data, detachmentSelection)
  if (savedSelectionErrors(data, picked, loaded).length) return null
  const forces = [...forceSelections.values()]
  const evaluated = evaluateForces(forces, loaded.index, { primaryCatalogueId: data.catalogueId })
  const pointsBySelection = selectionPointsOf(forces, evaluated)
  const adjustment = adjustUnitPoints(loaded, data, picked, pointsBySelection)
  return {
    points: evaluated.points + adjustment,
    label:
      storedName ||
      rosterLabel({
        factionName: factionNameOf(loaded, data.catalogueId, loadedRules),
        detachmentNames: chosen.map((option) => option.name),
        limit: data.limit,
        units: labelUnitsOf(picked, pointsBySelection),
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

function specialKind(choice: UnitChoice, upgradeNames: ReadonlySet<string>) {
  if (!/enhancement|upgrade/i.test(choice.name)) return null
  return choiceOptionsForPricing(choice).every((option) => upgradeNames.has(routeSlug(option.name)))
    ? ('upgrade' as const)
    : /enhancement/i.test(choice.name)
      ? ('enhancement' as const)
      : null
}

function selectedSpecials(
  choices: readonly UnitChoice[],
  catalogued: ReturnType<typeof wargearOf>,
  upgradeNames: ReadonlySet<string>,
  enhancementNames: ReadonlySet<string>,
) {
  const selected = choices.flatMap((choice) =>
    choiceOptionsForPricing(choice)
      .filter((option) => option.count > 0)
      .map((option) => ({ name: option.name, kind: specialKind(choice, upgradeNames) })),
  )
  const automatic = catalogued.filter((piece) => enhancementNames.has(routeSlug(piece.name))).map((piece) => piece.name)
  return {
    enhancements: uniqueNames([...selected.filter((option) => option.kind === 'enhancement').map((option) => option.name), ...automatic]),
    upgrades: selected.filter((option) => option.kind === 'upgrade').map((option) => option.name),
    specialSelections: new Set([
      ...selected.filter((option) => option.kind).map((option) => routeSlug(option.name)),
      ...automatic.map(routeSlug),
    ]),
  }
}

function calculateRoster(
  data: PriceInput,
  loaded: LoadedCatalogue | null,
  rules: LoadedRules | null,
  mode: 'full' | 'assessment',
  unitCache?: Map<string, BuiltUnit | null>,
) {
  if (!loaded) return null

  // Enhancements and unit limits can depend on the detachment already being in
  // the roster when units are expanded.
  const { chosen, selections: detachmentSelection } = rosterDetachments(loaded, data.catalogueId, data.detachmentIds)
  const factionSlug = routeSlug(loaded.index.catalogues.get(data.catalogueId)?.name ?? '')
  const factionName = factionNameOf(loaded, data.catalogueId, rules)
  const rulesId = rulesFaction(rules, factionSlug)
  const references = rules?.detachmentReferences.get(rulesId)
  const details = rules?.detachmentDetails.get(rulesId)
  const detailFor = (option: (typeof chosen)[number]) => detachmentNamed(details, option.name)
  const referenceFor = (option: (typeof chosen)[number]) => detachmentNamed(references, option.name)
  const allowedDispositions = [
    ...new Set(
      chosen.flatMap((option) => {
        const reference = referenceFor(option)
        return reference ? reference.dispositions : option.disposition ? [option.disposition] : []
      }),
    ),
  ]
  const purchased = chosen.map((option) => ({
    name: option.name,
    points: detachmentPoints(loaded, data.catalogueId, option.id, referenceFor(option)),
  }))
  // The King of the Colosseum optional rule. The borrowed detachment is never added to the
  // roster, so it brings no rules, enhancements or stratagems: it sells its Force
  // Disposition and nothing else, for the detachment points this roster left unspent. An
  // unaffordable or unpriced borrow grants nothing, so an illegal list cannot quietly
  // play a mission matchup it did not pay for.
  const borrowedDetachment = data.borrowedDetachmentId
    ? (rosterDetachments(loaded, data.catalogueId, [data.borrowedDetachmentId]).chosen[0] ?? null)
    : null
  const borrowedReference = borrowedDetachment ? referenceFor(borrowedDetachment) : undefined
  const borrowedPoints = borrowedDetachment ? detachmentPoints(loaded, data.catalogueId, borrowedDetachment.id, borrowedReference) : null
  const ownPoints = purchased.some((option) => option.points === null)
    ? null
    : purchased.reduce((total, option) => total + (option.points ?? 0), 0)
  const borrowedError = borrowedDispositionError(
    data.limit,
    data.optionalRules,
    { points: ownPoints },
    data.borrowedDetachmentId ? { points: borrowedPoints } : null,
  )
  const borrowedDispositions =
    borrowedError || !borrowedDetachment
      ? []
      : (borrowedReference?.dispositions ?? (borrowedDetachment.disposition ? [borrowedDetachment.disposition] : []))
  const { disposition, error: dispositionError } = resolveDisposition([...allowedDispositions, ...borrowedDispositions], data.disposition)
  const detachmentSpecials = chosen.map((option) => {
    const detail = detailFor(option)
    return { option, detail, ...describedEnhancements(loaded, data.catalogueId, option, detail) }
  })
  const mfmDetachments = chosen.flatMap((option) => mfmDetachmentFor(loaded, data.catalogueId, option.name) ?? [])
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
  const reserveExemptionSelectors = reserveSelectorsIn(
    detachmentSpecials.flatMap(({ detail }) => detail?.rules.map((rule) => rule.description) ?? []),
    loaded.datacards.textFacts,
  )
  const enhancementDescriptions = new Map(detachmentSpecials.flatMap(({ described }) => [...described]))
  const budget = detachmentPointBudget(data.limit)
  const spent = purchased.reduce((total, option) => total + (option.points ?? 0), 0)
  const upgradeNames = new Set([
    ...detachmentSpecials.flatMap(({ detail }) => detail?.upgrades.map((upgrade) => routeSlug(upgrade.name)) ?? []),
    ...mfmDetachments.flatMap(
      (detachment) =>
        detachment.enhancements?.filter((entry) => isUpgrade(entry.name)).map((entry) => routeSlug(withoutUpgrade(entry.name))) ?? [],
    ),
  ])
  const enhancementNames = new Set(
    detachmentSpecials.flatMap(({ detail, catalogue }) => [
      ...(detail?.enhancements.map((enhancement) => routeSlug(enhancement.name)) ?? []),
      ...(catalogue?.forcedEnhancements.map((enhancement) => routeSlug(enhancement.name)) ?? []),
      ...mfmDetachments.flatMap(
        (detachment) => detachment.enhancements?.filter((entry) => !isUpgrade(entry.name)).map((entry) => routeSlug(entry.name)) ?? [],
      ),
    ]),
  )
  const detachmentError = !loaded.factions.some((faction) => faction.id === data.catalogueId)
    ? 'This roster uses a replaced faction catalogue. Choose a current faction and detachment.'
    : chosen.length !== data.detachmentIds.length
      ? 'This roster has a detachment that is no longer available. Choose a current detachment.'
      : detachmentPointsError(purchased, budget, data.waivedRules)

  const { picked, forceSelections, roster } = rosterForces(loaded, data, detachmentSelection, unitCache ?? sharedBuiltUnitsFor(loaded))
  // Pricing is a roster being mustered, which is what a datasheet's force-scoped rules ask about.
  const options = { primaryCatalogueId: data.catalogueId, mustering: true }
  const forces = [...forceSelections.values()]
  const selections = forces.flat()
  const selectionIndex = new Map(selections.map((selection, at) => [selection, at]))
  const keywordsByCatalogue = new Map<string, ReturnType<typeof keywordsBySelection>>()
  const rosterKeywordsFor = (catalogueId: string) =>
    remember(keywordsByCatalogue, catalogueId, () => keywordsBySelection(selections, loaded.index, { primaryCatalogueId: catalogueId }))
  const keywordMatrixFor = (catalogueId: string) => rosterKeywordsFor(catalogueId).map(({ keywords }) => keywords)
  const keywordsFor = (catalogueId: string, at: number) => rosterKeywordsFor(catalogueId)[at]?.keywords ?? []
  const catalogueOfUnit = (unit: (typeof picked)[number]) => unitCatalogueId(loaded, data, unit)
  const keywordNamesOf = (unit: (typeof picked)[number]) => {
    const at = selectionIndex.get(unit.selection)
    return keywordNames(at === undefined ? [] : keywordsFor(catalogueOfUnit(unit), at), loaded.index)
  }
  // Model kinds are the dear part of a unit's projection, and the price reads them
  // twice: once to find units the catalogue composes itself, and once to draw each
  // unit's card. Project each built unit once and keep the result with it.
  const modelKindsFor = (unit: (typeof picked)[number]) =>
    remember(builtModelKinds, unit.source, () => modelKindsOf(unit.entryId, unit.selection, loaded.index, options))
  const whole = evaluateForces(forces, loaded.index, options)
  const selectionPoints = selectionPointsOf(forces, whole)
  const points = whole.points + adjustUnitPoints(loaded, data, picked, selectionPoints)
  const pointCaps = pointCapErrors(forces, loaded.index, options, (selection) => selectionPoints.get(selection) ?? 0)
  const restrictions = rules?.factionRestrictions.get(factionSlug)
  // Keywords and Toughness are only inputs to these two construction rule sets.
  // Projecting every contextual datasheet for an ordinary roster made pricing
  // revisit the complete roster once per unit, despite never reading the result.
  const constructionUnits =
    restrictions || isKotcLimit(data.limit)
      ? picked.map((unit) => {
          const catalogueId = catalogueOfUnit(unit)
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
            warlord: hasWarlordToggle(unit.toggles),
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
  if (whole.errors.some((error) => error.limit)) {
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
  }
  const selfContradictory = new Set(whole.errors.filter((error) => isCatalogueSelfContradiction(error, composedByCatalogue)))
  const pickedSelections = data.units.map((_, key) => picked.find((unit) => unit.key === key)?.selection)
  const pickedIndexByKey = new Map(picked.map((unit, at) => [unit.key, at]))
  const attachedByHost = groupBy(data.units.keys(), (key) => attachmentHost(data.units, key))
  const specialsByKey = new Map(
    picked.map((unit) => [
      unit.key,
      selectedSpecials(unit.choices, enhancementNames.size ? wargearOf(unit.selection, loaded.index) : [], upgradeNames, enhancementNames),
    ]),
  )
  // Core rules: no unit, attached units included, has more than one enhancement, and an upgrade is one.
  const enhancementsPerUnitErrors = [...attachedByHost].flatMap(([host, keys]) => {
    const held = keys.reduce((total, key) => {
      const specials = specialsByKey.get(key)
      return total + (specials ? specials.enhancements.length + specials.upgrades.length : 0)
    }, 0)
    const unit = data.units[host]
    if (held <= 1 || !unit) return []
    const entryName = loaded.index.definitions.get(unit.entryId)?.name ?? unit.entryId
    return [{ entryId: unit.entryId, entryName, message: `has ${held} enhancements, but a unit, attached or not, can have only one` }]
  })

  /*
   * The enhancements an army may hold, which its battle size sets for the whole army
   * rather than for anything in it. The count is the data's own: a second copy of an
   * upgrade costs no enhancement, so the army's total already excludes it.
   */
  const enhancementsAllowed = enhancementLimit(loaded.index, forces, options)
  const enhancementsHeld = whole.costs[ENHANCEMENT_COST] ?? 0
  const reported = [
    ...savedSelectionErrors(data, picked, loaded),
    ...whole.errors.filter((error) => !isDetachmentWrapperLimit(error, chosen.length) && !selfContradictory.has(error)),
    ...attachmentErrors(
      data.units,
      loaded.index,
      pickedSelections,
      data.units.map((_, key) => {
        const unit = picked.find((candidate) => candidate.key === key)
        return unit ? keywordNamesOf(unit) : undefined
      }),
    ),
    ...factionRestrictionViolations(restrictions, constructionUnits),
    ...(isKotcLimit(data.limit) ? kotcViolations(chosen.length, constructionUnits, data.limit, data.waivedRules ?? []) : []),
    ...(!isKotcLimit(data.limit) && enforces(data.waivedRules, 'warlord') ? armyWarlordErrors(picked) : []),
    ...detachmentLockErrors(loaded, data, picked, roster),
    ...pointCaps.errors,
    ...enhancementsPerUnitErrors,
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

  if (mode === 'assessment')
    return {
      kind: 'assessment' as const,
      points,
      detachmentError,
      dispositionError,
      errors,
      units: picked.map((unit) => {
        const { enhancements, upgrades } = specialsByKey.get(unit.key)!
        return { key: unit.key, size: { models: unit.size.models }, enhancements, upgrades }
      }),
    }

  return {
    kind: 'full' as const,
    unitLimits: data.includeUnitLimits
      ? unitIdsIn(loaded, data.catalogueId, { battleSize: data.limit, waivedRules: data.waivedRules, nonMatchedPlay: true }).map((id) => ({
          id,
          limit: contextualUnitLimit(loaded, data.catalogueId, id, data.limit, data.waivedRules ?? [], selections),
        }))
      : undefined,
    revision: loaded.index.revision,
    edition: loaded.edition ? { id: loaded.edition.id, name: loaded.edition.name, status: loaded.edition.status } : undefined,
    // Folded here rather than in the browser so a battle snapshot, a library row and
    // the field's own placeholder all read the one answer.
    label: rosterLabel({
      factionName,
      detachmentNames: chosen.map((option) => option.name),
      limit: data.limit,
      units: labelUnitsOf(picked, selectionPoints),
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
    points,
    errors,
    unhandled: [
      ...whole.unhandled,
      ...pointCaps.unhandled.filter((note) => !whole.unhandled.includes(note)),
      ...(forceSelections.size > 1 ? ['allied-force eligibility is not present in the synced catalogue data'] : []),
    ],
    selections,
    units: picked.map((unit) => {
      const catalogueId = catalogueOfUnit(unit)
      const mfmUnit = pickedMfmUnit(loaded, data, unit)
      const definition = loaded.index.definitions.get(unit.entryId) ?? { id: unit.entryId }
      const unitSelectionIndex = selectionIndex.get(unit.selection)
      const unitKeywords = keywordNamesOf(unit)
      const host = attachmentHost(data.units, unit.key)
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
      const catalogued = wargearOf(unit.selection, loaded.index)
      const { enhancements: selectedEnhancements, upgrades, specialSelections } = specialsByKey.get(unit.key)!
      const describedChoices: ((typeof unit.choices)[number] & { kind?: 'enhancement' | 'upgrade' })[] = unit.choices.map((choice) => {
        const choiceOptions = choiceOptionsForPricing(choice).map((option) => {
          const pieceCounts = choiceOptionWargear(choice.key, option.id, unit.selection, loaded.index, options)
          const ownPieces = ownChoiceOptionWargear(unit.choices, choice.key, option.id, unit.selection, loaded.index, options)
          const mfmPoints = mfmOptionPoints(mfmDetachments, mfmUnit, choice.name, option.name, ownPieces, option.count)
          const priced = mfmPoints === null ? option : { ...option, points: mfmPoints }
          return pieceCounts.length ? { ...priced, pieces: pieceCounts.map((piece) => piece.name), pieceCounts } : priced
        })
        const kind = specialKind(choice, upgradeNames)
        if (!kind) return { ...choice, options: choiceOptions }
        return {
          ...choice,
          kind,
          options: choiceOptions.map((option) => {
            const description = findEnhancementDescription(enhancementDescriptions, chosen, option.name)
            return { ...option, description, keywordRules: rulesReferencedIn(loaded, [description]) }
          }),
        }
      })
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
      const strategicReserveExempt =
        reserveExemptionSelectors.some((selector) => matchesKeywordSelector(selector, unitKeywords)) ||
        selectedEnhancements.some((enhancement) =>
          grantsReserveExemptionIn(findEnhancementDescription(enhancementDescriptions, chosen, enhancement), loaded.datacards.textFacts),
        )
      const wargear = heldWargear(models, choices, catalogued)
      const specialWargear = new Set(
        unit.choices.flatMap((choice) =>
          specialKind(choice, upgradeNames)
            ? choiceOptionsForPricing(choice)
                .filter((option) => option.count > 0)
                .flatMap((option) =>
                  choiceOptionWargear(choice.key, option.id, unit.selection, loaded.index, options).map((piece) => routeSlug(piece.name)),
                )
            : [],
        ),
      )
      const attachment = remember(builtAttachments, unit.source, () => attachmentPartyOf(definition, loaded.index, unit.selection))
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
        ...(unitKeywords.some((keyword) => keyword.toLowerCase() === 'transport') ? { transport: true } : {}),
        choices,
        models,
        toggles: unit.toggles,
        enhancements: selectedEnhancements,
        upgrades,
        wargear: wargear.filter((piece) => !specialSelections.has(routeSlug(piece.name)) || specialWargear.has(routeSlug(piece.name))),
        group: shelfIn(
          loaded.index,
          unit.entryId,
          unitSelectionIndex === undefined ? [] : (rosterKeywordsFor(catalogueId)[unitSelectionIndex]?.primaries ?? []),
        ),
        ...attachment,
        keywords: unitKeywords,
      }
    }),
  }
}

export function calculateRosterPrice(data: PriceInput, loaded: LoadedCatalogue | null, loadedRules: LoadedRules | null) {
  const result = calculateRoster(data, loaded, loadedRules, 'full')
  if (!result || result.kind !== 'full') return null
  const { kind: _, ...price } = result
  return price
}

export function calculateRosterAssessment(
  data: PriceInput,
  loaded: LoadedCatalogue | null,
  loadedRules: LoadedRules | null,
  unitCache?: Map<string, BuiltUnit | null>,
) {
  const result = calculateRoster(data, loaded, loadedRules, 'assessment', unitCache)
  if (!result || result.kind !== 'assessment') return null
  const { kind: _, ...assessment } = result
  return assessment
}

export const uniqueNames = (names: readonly string[]): string[] => uniqueBy(names, routeSlug)

export const findEnhancementDescription = (
  descriptions: ReadonlyMap<string, string>,
  detachments: readonly { name: string }[],
  enhancement: string,
) => detachments.map((detachment) => descriptions.get(descriptionKey(detachment.name, enhancement))).find(Boolean) ?? null

export function resolveDisposition(allowed: readonly string[], selected: string | null) {
  const disposition = allowed.includes(selected ?? '') ? selected : allowed.length === 1 ? allowed[0] : null
  return { disposition, error: allowed.length > 1 && !disposition ? 'Pick a disposition.' : null }
}
