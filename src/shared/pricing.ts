import { groupBy, RecentlyUsed, uniqueBy, remember } from '../core/collections'
import { armyIds, attachmentErrors, attachmentPartyOf, inArmy } from '../core/attach'
import { attachmentHost } from '../core/attachedUnits'
import { routeSlug } from '../core/slug'
import { joinKey } from '../core/text'
import { canonicalDetachmentName } from '../core/detachmentName'
import {
  borrowedDispositionError,
  battleSizeOf,
  detachmentPointBudget,
  detachmentPointsError,
  enforces,
  isKotcLimit,
  type ModelLine,
} from '../core/battle'
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
import { buildUnit, type BuiltUnit, catalogueTreeOf, resolveUnitChoice } from '../core/roster'
import { unavailableRosterSelections } from '../core/rosterSelections'
import { type ChoiceOptions, hasWarlordToggle, type UnitChoice, unitChoices } from '../core/unitChoices'
import { withUnitSpread } from '../core/unitSpread'
import { wargearOf } from '../core/wargear'
import { rulesReferencedIn } from './catalogueRules'
import { vsUnitRecords } from '../core/vsDataUnit'
import { vsFirstPickOf } from './vsDataPicks'
import { battleSizesOf, buildPick, vsDefinitionsOf, vsPickKeywords, vsPickPrices } from './vsDataBuild'
import { contextualAbilityNamesIn, datasheetIn, modelLinesOf, offeredPicksIn, toughnessOf } from './catalogue'
import { combatCarriers } from '../core/combatLoadout'
import { matchesKeywordSelector } from '../core/keywords'
import type { GrantPick } from '../core/battle'
import type { PickedGrant } from '../core/textFacts'
import { describedEnhancements } from './catalogueDescriptions'
import { cardName, descriptionKey } from './datacards'
import { factionDisplayName } from './factionNames'
import { detachmentNamed } from './factionReferences'
import { contextualUnitLimit, detachmentsUnlocking, shelfIn, unitIdsIn } from './cataloguePicker'
import { isDetachmentWrapperLimit, rosterDetachments } from './rosterDetachments'
import { detachmentPoints } from './detachmentPoints'
import {
  choiceOptionsForPricing,
  mfmOptionAdjustment,
  mfmOptionPoints,
  mfmUnitFor,
  unitPointAdjustment,
  vsDataUnitPoints,
} from './unitPoints'
import { isUpgrade, mfmDetachmentFor, withoutUpgrade } from './mfm'
import { deploymentRules } from './rosterDeployment'
import {
  vsDataChecks,
  vsDataEnhancementOptions,
  vsDataErrors,
  vsDataAllyLimited,
  vsDataUnheld,
  vsDataPlaces,
  vsDataWithoutDetachments,
  vsPickErrors,
} from './vsDataLegality'
import { combatFactsIn, grantsReserveExemptionIn, pickedGrantsOf, reminderIn, reserveSelectorsIn } from './textFacts'
import { heldWargear, replacementKey, type ReplacementSource } from './heldWargear'
import { isCatalogueSelfContradiction, kotcViolations, warlordCountProblem } from './formatRestrictions'
import { vsDataRefusedUnits } from './vsDataOffers'
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
const builtModelLines = new WeakMap<BuiltUnit, ModelLine[] | undefined>()

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
      built = buildPick(loaded, wanted, data, { primaryCatalogueId: data.catalogueId, mustering: true, roster })
      if (cacheKey) unitCache?.set(cacheKey, built)
    }
    if (!built) return []
    const source = built
    // Repeated picks need distinct top-level identities for contextual evaluation.
    if (unitCache) built = { ...built, selection: { ...catalogueTreeOf(built) } }
    const entry = loaded.index.definitions.get(wanted.entryId)
    return [{ key, entryId: wanted.entryId, name: entry?.name ?? wanted.entryId, source, ...built }]
  })
  const forceSelections = new Map<string, Selection[]>([[data.catalogueId, [...roster]]])
  for (const unit of picked) {
    const owner = unitCatalogueId(data, unit)
    const force = forceSelections.get(owner) ?? [...configuration]
    force.push(catalogueTreeOf(unit))
    forceSelections.set(owner, force)
  }
  // A VS pick's price is VS Data's for the whole list, copies counted across it; one VS Data leaves unpriced has none.
  return { picked, forceSelections, roster, vsPrices: vsPickPrices(loaded, data, vsUnitsOf(data, picked)) }
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
    const offeredBy = detachmentsUnlocking(loaded, data.catalogueId, unit.entryId, { ids: data.detachmentIds, selections: roster })
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
  picked: readonly { name: string; selection?: Selection; toggles: BuiltUnit['toggles'] }[],
  pointsBySelection: ReadonlyMap<Selection, number>,
): LabelUnit[] {
  return picked.map((unit) => ({
    name: unit.name,
    points: pointsBySelection.get(catalogueTreeOf(unit)) ?? 0,
    warlord: hasWarlordToggle(unit.toggles),
  }))
}

type PickedUnit = { key: number; entryId: string }

/** The book a picked unit is drawn from: the one the pick names, else the roster's own. */
// A pick that names no book belongs to the army, as the builder's own picks do: the
// book defining the entry is often one the army imports, such as a chapter's Space Marines.
const unitCatalogueId = (data: PriceInput, unit: PickedUnit) => data.units[unit.key]?.catalogueId ?? data.catalogueId

const pickedMfmUnit = (loaded: LoadedCatalogue, data: PriceInput, unit: PickedUnit) =>
  mfmUnitFor(loaded, unitCatalogueId(data, unit), unit.entryId, data.detachmentIds)

/**
 * The picks VS Data checks, fielded by their VS Data IDs, and those of them it prices: their catalogue builds stay in the
 * tree only for the other picks' conditions. In a list VS Data cannot place, their own roster limits stay the catalogue's.
 */
function vsPicksOf(
  picked: readonly { key: number; selection?: Selection; vs?: unknown }[],
  vsPrices: ReadonlyMap<number, number>,
  ownLimits: (unit: { key: number }) => boolean,
) {
  const vs = picked.filter((unit) => unit.vs)
  return {
    checked: new Set(vs.map((unit) => catalogueTreeOf(unit))),
    priced: new Set(vs.flatMap((unit) => (vsPrices.has(unit.key) ? [catalogueTreeOf(unit)] : []))),
    ownLimits: new Set(vs.flatMap((unit) => (ownLimits(unit) ? [catalogueTreeOf(unit)] : []))),
  }
}

function selectionPointsOf(forces: readonly (readonly Selection[])[], evaluated: { selectionPoints: readonly (readonly number[])[] }) {
  const points = new Map<Selection, number>()
  forces.forEach((force, forceAt) => force.forEach((selection, at) => points.set(selection, evaluated.selectionPoints[forceAt]?.[at] ?? 0)))
  return points
}

function adjustUnitPoints(
  loaded: LoadedCatalogue,
  data: PriceInput,
  picked: ReturnType<typeof rosterForces>['picked'],
  vsPrices: ReadonlyMap<number, number>,
  pointsBySelection: Map<Selection, number>,
) {
  let adjustment = 0
  const copies = new Map<string, number>()
  const detachments = rosterDetachments(loaded, data.catalogueId, data.detachmentIds).chosen.flatMap(
    (option) => mfmDetachmentFor(loaded, data.catalogueId, option.name) ?? [],
  )
  for (const unit of picked) {
    const catalogueId = unitCatalogueId(data, unit)
    const definition = loaded.index.definitions.get(unit.entryId)
    const sheetId = definition ? targetOf(definition, loaded.index.definitions).id : unit.entryId
    const copy = (copies.get(sheetId) ?? 0) + 1
    copies.set(sheetId, copy)
    const vsData =
      vsPrices.get(unit.key) ?? vsDataUnitPoints(loaded, data.catalogueId, unit.entryId, data.detachmentIds, detachments, unit, copy)
    const mfmUnit = pickedMfmUnit(loaded, data, unit)
    const difference =
      vsData !== null
        ? vsData - (pointsBySelection.get(catalogueTreeOf(unit)) ?? 0)
        : unitPointAdjustment(loaded, data.catalogueId, catalogueId, unit.entryId, unit.size.models, copy, data.detachmentIds) +
          mfmOptionAdjustment(loaded.index, unit, mfmUnit, detachments, { primaryCatalogueId: data.catalogueId, mustering: true })
    pointsBySelection.set(catalogueTreeOf(unit), (pointsBySelection.get(catalogueTreeOf(unit)) ?? 0) + difference)
    adjustment += difference
  }
  return adjustment
}

/** Each saved pick's datasheet and, for a VS pick, the unit VS Data built, by its place in the list. */
const vsUnitsOf = (data: PriceInput, picked: readonly { key: number; vs?: BuiltUnit['vs'] }[]) => {
  const byKey = new Map(picked.map((unit) => [unit.key, unit]))
  return data.units.map((pick, key) => ({ entryId: pick.entryId, vs: byKey.get(key)?.vs }))
}

/**
 * A VS pick's Enhancement as the list shows it, where the catalogue's tree holds none: one of a Detachment the list does
 * not take still costs its points, so it is named, and VS Data's checker refuses it.
 */
function withVsEnhancement(loaded: LoadedCatalogue, vs: NonNullable<BuiltUnit['vs']>, specials: ReturnType<typeof selectedSpecials>) {
  const enhancement = vs.unit.enhancement ? vsDefinitionsOf(loaded)?.get('enhancement', vs.unit.enhancement) : undefined
  if (!enhancement || specials.enhancements.length || specials.upgrades.length) return specials
  return enhancement.data.type === 'upgrade'
    ? { ...specials, upgrades: [enhancement.name] }
    : { ...specials, enhancements: [enhancement.name] }
}

/**
 * A VS pick's keywords, with the catalogue's keyword naming its own datasheet where VS Data gives none, as rules and
 * attachments still name units by it until VS Data settles whether the app prints them.
 */
function vsKeywordsWithName(unit: { name: string }, vs: string[] | null, catalogue: string[]) {
  if (!vs) return catalogue
  const named = catalogue.filter((keyword) => routeSlug(keyword) === routeSlug(unit.name))
  return [...vs, ...named.filter((keyword) => !vs.some((held) => routeSlug(held) === routeSlug(keyword)))]
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

/**
 * Saved counts the built unit holds fewer of: a unit size it can no longer field, or models and wargear beyond what it
 * can hold even at its largest size on their own, so counts the builder remembers from a larger squad, or from models
 * other choices now take the places of, stay quiet.
 */
function changedCountErrors(
  data: PriceInput,
  picked: ReturnType<typeof rosterForces>['picked'],
  loaded: LoadedCatalogue,
  roster: readonly Selection[],
  unitCache: Map<string, BuiltUnit | null>,
) {
  const rosterKey = JSON.stringify([loaded.index.revision, data.catalogueId, roster])
  return picked.flatMap((unit) => {
    // A VS pick's own selections are checked by VS Data; the catalogue's choices it keeps are not what it fields.
    if (unit.vs) return []
    const saved = data.units[unit.key]!
    const short = (built: BuiltUnit) =>
      Object.entries(saved.spreads ?? {}).flatMap(([key, counts]) =>
        Object.entries(counts).flatMap(([id, count]) => {
          const option = built.choices.find((choice) => choice.key === key)?.options.find((candidate) => candidate.id === id)
          return option && option.count < count ? [{ key, id, count, name: option.name, held: option.count }] : []
        }),
      )
    const largest = unit.size.options?.at(-1) ?? unit.size.max
    const holdsAlone = (count: ReturnType<typeof short>[number]) => {
      const wanted = { ...saved, models: largest, spreads: { [count.key]: { [count.id]: count.count } } }
      const cacheKey = `${rosterKey}${JSON.stringify(wanted)}`
      let alone = unitCache.get(cacheKey)
      if (alone === undefined) {
        alone = buildUnit(saved.entryId, loaded.index, largest, saved.choices, {
          primaryCatalogueId: data.catalogueId,
          mustering: true,
          roster,
          spreads: wanted.spreads,
          toggles: saved.toggles,
          floor: saved.floor,
        })
        unitCache.set(cacheKey, alone)
      }
      return !alone || !short(alone).some((other) => other.key === count.key && other.id === count.id)
    }
    return [
      ...(saved.models !== undefined && saved.models !== unit.size.models
        ? [
            {
              entryId: saved.entryId,
              entryName: unit.name,
              message: `the saved unit size of ${saved.models} models is no longer available; it now has ${unit.size.models}`,
            },
          ]
        : []),
      ...short(unit)
        .filter((count) => !holdsAlone(count))
        .map((count) => ({
          entryId: saved.entryId,
          entryName: unit.name,
          message: `the saved ${count.count}× ${count.name} is no longer available; it now has ${count.held}`,
        })),
    ]
  })
}

function selectionProblems(data: PriceInput, picked: ReturnType<typeof rosterForces>['picked'], loaded: LoadedCatalogue) {
  const byKey = new Map(picked.map((unit) => [unit.key, unit]))
  const saved = data.units.map((pick, key) => (byKey.get(key)?.vs ? { entryId: pick.entryId } : pick))
  return unavailableRosterSelections(saved, picked, (key, choiceKey, optionId) => {
    const unit = byKey.get(key)
    return unit?.size.options?.length ? resolveUnitChoice(catalogueTreeOf(unit), choiceKey, optionId, loaded.index) : null
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
  const { picked, forceSelections, vsPrices } = rosterForces(loaded, data, detachmentSelection, sharedBuiltUnitsFor(loaded))
  if (savedSelectionErrors(data, picked, loaded).length) return null
  const forces = [...forceSelections.values()]
  const evaluated = evaluateForces(
    forces,
    loaded.index,
    { primaryCatalogueId: data.catalogueId },
    vsPicksOf(picked, vsPrices, () => false),
  )
  const pointsBySelection = selectionPointsOf(forces, evaluated)
  const adjustment = adjustUnitPoints(loaded, data, picked, vsPrices, pointsBySelection)
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
 * drops the borrowed card without reporting anything. Callers pass the saved
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
  return choiceOptionsForPricing(choice).every((option) => upgradeNames.has(cardName(option.name)))
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
    upgrades: selected.filter((option) => option.kind === 'upgrade').map((option) => withoutUpgrade(option.name)),
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
  // A faction that takes no Detachment, as a Titan army does, plays its own dispositions whatever its list holds.
  const withoutDetachments = vsDataWithoutDetachments(loaded.vsRoster, data.catalogueId)
  const allowedDispositions = withoutDetachments ?? [
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
  // A faction that takes no Detachment, as a Titan army does, borrows none either.
  const takesNone = withoutDetachments !== null
  const borrowedDetachment =
    data.borrowedDetachmentId && !takesNone
      ? (rosterDetachments(loaded, data.catalogueId, [data.borrowedDetachmentId]).chosen[0] ?? null)
      : null
  const borrowedReference = borrowedDetachment ? referenceFor(borrowedDetachment) : undefined
  const borrowedPoints = borrowedDetachment ? detachmentPoints(loaded, data.catalogueId, borrowedDetachment.id, borrowedReference) : null
  const ownPoints = purchased.some((option) => option.points === null)
    ? null
    : purchased.reduce((total, option) => total + (option.points ?? 0), 0)
  // VS Data's check says a faction that takes no Detachment borrows none, so the borrow raises nothing more here.
  const borrowedError = takesNone
    ? null
    : borrowedDispositionError(
        data.limit,
        data.optionalRules,
        { points: ownPoints },
        data.borrowedDetachmentId ? { points: borrowedPoints } : null,
      )
  const borrowedDispositions =
    borrowedError || !borrowedDetachment
      ? []
      : (borrowedReference?.dispositions ?? (borrowedDetachment.disposition ? [borrowedDetachment.disposition] : []))
  const disposition = resolveDisposition([...allowedDispositions, ...borrowedDispositions], data.disposition)
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
    loaded.index.textFacts,
  )
  const enhancementDescriptions = new Map(detachmentSpecials.flatMap(({ described }) => [...described]))
  // Whose an enhancement or upgrade is, so its summary reads as that detachment's: the one chosen detachment whose card
  // prints its name; else the one BSData files its entry under, by name in the entry's comment; else the list's only one.
  const enhancementDetachment = (optionId: string, name: string) => {
    const printing = detachmentSpecials.filter(({ detail, catalogue }) =>
      [...(detail?.enhancements ?? []), ...(detail?.upgrades ?? []), ...(catalogue?.forcedEnhancements ?? [])].some(
        (enhancement) => cardName(enhancement.name) === cardName(name),
      ),
    )
    if (printing.length === 1) return printing[0]!.option.id
    const candidates = printing.length ? printing : detachmentSpecials
    const definition = loaded.index.definitions.get(optionId)
    const comment = definition && targetOf(definition, loaded.index.definitions).comment
    const filed = comment
      ? candidates.filter(({ option }) => joinKey(canonicalDetachmentName(option.name)) === joinKey(canonicalDetachmentName(comment)))
      : candidates
    return filed.length === 1 ? filed[0]!.option.id : undefined
  }
  // The one chosen detachment the frozen maps file an enhancement or upgrade option under, and its VS Data record there.
  const vsDataEnhancement = (optionId: string) => {
    const filed = chosen.flatMap((option) => {
      const vsDataId = loaded.vsPoints?.detachments[option.id]?.enhancementIds?.[optionId]
      return vsDataId ? [{ detachment: option.id, vsDataId }] : []
    })
    return filed.length === 1 ? filed[0] : undefined
  }
  const battleSizes = battleSizesOf(loaded)
  const budget = detachmentPointBudget(data.limit, battleSizes)
  const spent = purchased.reduce((total, option) => total + (option.points ?? 0), 0)
  const upgradeNames = new Set([
    ...detachmentSpecials.flatMap(({ detail }) => detail?.upgrades.map((upgrade) => cardName(upgrade.name)) ?? []),
    ...mfmDetachments.flatMap(
      (detachment) => detachment.enhancements?.filter((entry) => isUpgrade(entry.name)).map((entry) => cardName(entry.name)) ?? [],
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

  const { picked, forceSelections, roster, vsPrices } = rosterForces(
    loaded,
    data,
    detachmentSelection,
    unitCache ?? sharedBuiltUnitsFor(loaded),
  )
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
  const catalogueOfUnit = (unit: (typeof picked)[number]) => unitCatalogueId(data, unit)
  const keywordNamesOf = (unit: (typeof picked)[number]) => {
    const at = selectionIndex.get(catalogueTreeOf(unit))
    return keywordNames(at === undefined ? [] : keywordsFor(catalogueOfUnit(unit), at), loaded.index)
  }
  // Model kinds are the dear part of a unit's projection, and the price reads them
  // twice: once to find units the catalogue composes itself, and once to draw each
  // unit's card. Project each built unit once and keep the result with it.
  const modelKindsFor = (unit: (typeof picked)[number]) =>
    unit.vs?.models ??
    remember(builtModelKinds, unit.source, () => modelKindsOf(unit.entryId, catalogueTreeOf(unit), loaded.index, options))
  // VS Data checks the army as a whole where it records the list's book and Detachments; the catalogue's own roster
  // limits then stand only for the datasheets VS Data leaves to it.
  const placed = vsDataPlaces(loaded.vsRoster, data)
  // A unit VS Data's own limits cannot hold keeps the catalogue's, as two Emperor's Champions.
  const unheld = vsDataUnheld(
    loaded.vsRoster,
    data,
    picked.map((unit) => ({ ...unit, vs: unit.vs?.unit })),
  )
  const whole = evaluateForces(
    forces,
    loaded.index,
    options,
    vsPicksOf(picked, vsPrices, (unit) => !placed || unheld.has(unit.key)),
  )
  const selectionPoints = selectionPointsOf(forces, whole)
  const points = whole.points + adjustUnitPoints(loaded, data, picked, vsPrices, selectionPoints)
  // VS Data's ally points limits count what each unit costs the list.
  const checkedUnits = picked.map((unit) => ({ ...unit, vs: unit.vs?.unit, points: selectionPoints.get(catalogueTreeOf(unit)) ?? 0 }))
  const vsData = vsDataErrors(loaded.vsRoster, data, checkedUnits)
  // A keyword's points cap is VS Data's to say wherever VS Data limits every ally it counts, as Deathwatch's 500 in a
  // chapter. Where it also counts a datasheet VS Data doesn't map, as a Crucible daemon, both messages show, and only
  // the catalogue's total counts every unit.
  const pointCapResult = pointCapErrors(forces, loaded.index, options, (selection) => selectionPoints.get(selection) ?? 0)
  const allyLimited = vsData === null ? new Set<number>() : vsDataAllyLimited(loaded.vsRoster, data, checkedUnits)
  const keyOf = new Map(picked.map((unit) => [catalogueTreeOf(unit), unit.key]))
  const pointCaps = pointCapResult.errors.filter(
    (error) => !(pointCapResult.counted.get(error) ?? []).every((selection) => allyLimited.has(keyOf.get(selection) ?? -1)),
  )
  // Keywords and Toughness are only inputs to King of the Colosseum's construction rules.
  // Projecting every contextual datasheet for an ordinary roster would revisit the whole roster once per unit.
  const constructionUnits = isKotcLimit(data.limit)
    ? picked.map((unit) => {
        const catalogueId = catalogueOfUnit(unit)
        const sheet = datasheetIn(loaded, catalogueId, unit.entryId, {
          selections,
          unitSelectionIndex: selectionIndex.get(catalogueTreeOf(unit)),
          keywordIds: keywordsFor(catalogueId, selectionIndex.get(catalogueTreeOf(unit)) ?? -1),
        })
        return {
          entryId: unit.entryId,
          name: unit.name,
          keywords: sheet?.keywords ?? [],
          toughness: toughnessOf(sheet?.profiles ?? []),
          warlord: hasWarlordToggle(unit.toggles),
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
        floor: data.units[unit.key]?.floor,
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
  const pickedByKey = new Map(picked.map((unit) => [unit.key, unit]))
  const pickedSelections = data.units.map((_, key) => {
    const unit = pickedByKey.get(key)
    return unit && catalogueTreeOf(unit)
  })
  const attachedByHost = groupBy(data.units.keys(), (key) => attachmentHost(data.units, key))
  const specialsByKey = new Map(
    picked.map((unit) => {
      const specials = selectedSpecials(
        unit.choices,
        enhancementNames.size ? wargearOf(catalogueTreeOf(unit), loaded.index) : [],
        upgradeNames,
        enhancementNames,
      )
      return [unit.key, unit.vs ? withVsEnhancement(loaded, unit.vs, specials) : specials] as const
    }),
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
  const enhancementsAllowed = battleSizeOf(data.limit, battleSizes)?.enhancements ?? enhancementLimit(loaded.index, forces, options)
  const enhancementsHeld = whole.costs[ENHANCEMENT_COST] ?? 0
  const leftToCatalogue = new Set(
    picked.filter((unit) => unheld.has(unit.key) || !vsDataChecks(loaded.vsRoster, data.catalogueId, unit)).map((unit) => unit.name),
  )
  const enhancementOptions = vsData ? vsDataEnhancementOptions(loaded.vsRoster, data.detachmentIds) : new Set<string>()
  // What VS Data's checker says instead: a datasheet's own copy limit, a keyword's roster limit (a limit on the category
  // itself, not one a unit puts on its models through it) other than one only datasheets left to the catalogue meet, and
  // an Enhancement's limits.
  // VS Data's copy limit replaces the catalogue's where VS Data also finds one broken, so a disagreement stays visible.
  const vsCopyLimits = new Set(vsData?.filter((error) => error.message.startsWith('is limited to')).map((error) => error.entryId))
  const copyLimited = new Set(
    picked.flatMap((unit) => {
      if (!vsCopyLimits.has(unit.entryId) || unheld.has(unit.key)) return []
      const definition = loaded.index.definitions.get(unit.entryId)
      return [unit.entryId, ...(definition ? [targetOf(definition, loaded.index.definitions).id] : [])]
    }),
  )
  const rosterScoped = (id: string) =>
    Boolean(
      loaded.index.categories
        .get(id)
        ?.constraints?.some((constraint) => constraint.type === 'max' && ['roster', 'force'].includes(constraint.scope)),
    )
  const rosterLimitReplaced = (error: { entryId: string; entryName: string; limit?: unknown }) =>
    vsData !== null &&
    ((error.limit !== undefined && copyLimited.has(error.entryId)) ||
      (rosterScoped(error.entryId) && !leftToCatalogue.has(error.entryName)) ||
      enhancementOptions.has(error.entryId))
  // VS Data says which Detachments a unit needs wherever it places the list, so the catalogue's locks stand only beside none.
  const detachmentLocks = vsData === null ? detachmentLockErrors(loaded, data, picked, roster) : []
  const reported = [
    ...savedSelectionErrors(data, picked, loaded),
    ...changedCountErrors(data, picked, loaded, roster, unitCache ?? sharedBuiltUnitsFor(loaded)),
    ...whole.errors.filter(
      (error) => !isDetachmentWrapperLimit(error, chosen.length) && !selfContradictory.has(error) && !rosterLimitReplaced(error),
    ),
    ...attachmentErrors(
      data.units,
      loaded.index,
      pickedSelections,
      data.units.map((_, key) => {
        const unit = pickedByKey.get(key)
        return unit ? keywordNamesOf(unit) : undefined
      }),
      data.detachmentIds,
    ),
    // King of the Colosseum's own Detachment count, which the player can waive, stands for VS Data's.
    ...(vsData?.filter((error) => !(isKotcLimit(data.limit) && error.message === 'needs one to three Detachments')) ??
      vsDataRefusedUnits(loaded, data, picked)),
    ...(isKotcLimit(data.limit)
      ? kotcViolations(chosen.length, constructionUnits, data.limit, data.waivedRules ?? [], enhancementsHeld)
      : []),
    ...(!isKotcLimit(data.limit) && enforces(data.waivedRules, 'warlord') ? armyWarlordErrors(picked) : []),
    ...detachmentLocks,
    ...(vsData === null ? vsPickErrors(loaded.vsRoster, data, checkedUnits) : []),
    ...pointCaps,
    ...enhancementsPerUnitErrors,
    // King of the Colosseum's own Enhancement count stands for this one.
    ...(vsData === null && !isKotcLimit(data.limit) && enhancementsAllowed !== null && enhancementsHeld > enhancementsAllowed
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
  const errors = uniqueBy(reported, (error) => JSON.stringify([error.entryId, error.message]))
  const army = armyIds(
    picked.map((unit) => unit.entryId),
    loaded.index,
    data.detachmentIds,
  )

  if (mode === 'assessment')
    return {
      kind: 'assessment' as const,
      points,
      detachments: purchased,
      detachmentError,
      errors,
      units: picked.map((unit) => {
        const { enhancements, upgrades } = specialsByKey.get(unit.key)!
        return { key: unit.key, size: { models: unit.size.models }, enhancements, upgrades }
      }),
    }

  // The units a rule lets the player pick as the battle begins for its deployment ability, which battle setup offers: a
  // chosen detachment's rule, or one of a unit's own abilities, wargear or Enhancements.
  const vsUnits = vsUnitsOf(data, picked)
  const offeredPicks = uniqueBy(
    [
      ...detachmentSpecials.flatMap(({ detail }) =>
        (detail?.rules ?? []).flatMap((rule) =>
          rule.description ? pickedGrantsOf(rule.description, loaded.index.textFacts).map((grant) => ({ rule: rule.name, grant })) : [],
        ),
      ),
      ...picked.flatMap((unit) => [
        ...offeredPicksIn(loaded, catalogueOfUnit(unit), unit.entryId, {
          selections,
          unitSelectionIndex: selectionIndex.get(catalogueTreeOf(unit)),
        }),
        ...specialsByKey.get(unit.key)!.enhancements.flatMap((enhancement) => {
          const text = findEnhancementDescription(enhancementDescriptions, chosen, enhancement)
          return text ? pickedGrantsOf(text, loaded.index.textFacts).map((grant) => ({ rule: enhancement, grant })) : []
        }),
      ]),
    ],
    (offered) => JSON.stringify(offered),
  )
  // One pick a rule for each unit, as a pick names its rule alone.
  const grantPicksFor = (keywords: readonly string[]): GrantPick[] =>
    uniqueBy(
      offeredPicks.flatMap(({ rule, grant }) => {
        const { formationOptions, prebattleRules } = deploymentRules([grant.ability])
        const ability = formationOptions[0] ?? prebattleRules[0]
        if (!ability || (grant.recipients.length && !grant.recipients.some((selector) => matchesKeywordSelector(selector, keywords))))
          return []
        return [{ rule, ability, ...pickBounds(grant) }]
      }),
      (pick) => pick.rule,
    )
  return {
    kind: 'full' as const,
    unitLimits: data.includeUnitLimits
      ? unitIdsIn(loaded, data.catalogueId, { battleSize: data.limit, waivedRules: data.waivedRules, nonMatchedPlay: true }).map((id) => ({
          id,
          ...contextualUnitLimit(loaded, data.catalogueId, id, data.limit, data.waivedRules ?? [], selections),
          vs: vsFirstPickOf(loaded, data, id),
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
    borrowedDetachment: borrowedDetachment?.name ?? null,
    borrowedError,
    strategicReserveFactsComplete,
    points,
    errors,
    unhandled: [
      ...whole.unhandled,
      ...pointCapResult.unhandled.filter((note) => !whole.unhandled.includes(note)),
      ...(forceSelections.size > 1 ? ['allied-force eligibility is not present in the synced catalogue data'] : []),
    ],
    selections,
    units: picked.map((unit) => {
      const catalogueId = catalogueOfUnit(unit)
      const mfmUnit = pickedMfmUnit(loaded, data, unit)
      const definition = loaded.index.definitions.get(unit.entryId) ?? { id: unit.entryId }
      const unitSelectionIndex = selectionIndex.get(catalogueTreeOf(unit))
      const unitKeywords = unit.vs
        ? vsKeywordsWithName(unit, vsPickKeywords(loaded, data, vsUnits, unit.key), keywordNamesOf(unit))
        : keywordNamesOf(unit)
      const host = attachmentHost(data.units, unit.key)
      const companions = (attachedByHost.get(host) ?? []).flatMap((key) => {
        const companion = pickedByKey.get(key)
        const companionSelectionIndex = companion ? selectionIndex.get(catalogueTreeOf(companion)) : undefined
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
      // A unit already holding the ability has nothing to gain from the pick.
      const grantPicks = grantPicksFor(unitKeywords).filter(
        (pick) =>
          !(deployment.formationOptions as readonly string[]).includes(pick.ability) &&
          !(deployment.prebattleRules as readonly string[]).includes(pick.ability),
      )
      const catalogued = wargearOf(catalogueTreeOf(unit), loaded.index)
      const { enhancements: selectedEnhancements, upgrades, specialSelections } = specialsByKey.get(unit.key)!
      const vsDefinitions = unit.vs ? vsDefinitionsOf(loaded) : null
      const describedChoices: ((typeof unit.choices)[number] & { kind?: 'enhancement' | 'upgrade' })[] = unit.choices.map((choice) => {
        const choiceOptions = choiceOptionsForPricing(choice).map((option) => {
          // A VS pick's options are VS Data's, priced by it, a bundle naming what it holds.
          if (vsDefinitions) {
            const inside = Object.entries(vsDefinitions.get('wargear', option.id)?.data.includes ?? {})
            const pieceCounts = inside.map(([id, n]) => ({ name: vsDefinitions.get('wargear', id)?.name ?? id, count: n * option.count }))
            return pieceCounts.length ? { ...option, pieces: pieceCounts.map((piece) => piece.name), pieceCounts } : option
          }
          const pieceCounts = choiceOptionWargear(choice.key, option.id, catalogueTreeOf(unit), loaded.index, options)
          const ownPieces = ownChoiceOptionWargear(unit.choices, choice.key, option.id, catalogueTreeOf(unit), loaded.index, options)
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
            const enhancement = vsDefinitions?.get('enhancement', option.id)
            const filed = enhancement
              ? {
                  detachment: chosen.find((detachment) => loaded.vsRoster?.detachments[detachment.id] === enhancement.data.detachment)?.id,
                  vsDataId: enhancement.id,
                }
              : vsDataEnhancement(option.id)
            const detachment = filed?.detachment ?? enhancementDetachment(option.id, option.name)
            const combat = description === null ? undefined : combatFactsIn(description, loaded.index.textFacts)
            const reminder = description === null ? undefined : reminderIn(description, loaded.index.textFacts)
            return {
              ...option,
              description,
              keywordRules: rulesReferencedIn(loaded, [description]),
              ...(detachment ? { detachment } : {}),
              ...(filed ? { vsDataId: filed.vsDataId } : {}),
              // A device that holds no words judges the option in combat and suggests its reminder from these.
              ...(combat === undefined ? {} : { combat }),
              ...(reminder ? { reminder } : {}),
            }
          }),
        }
      })
      const models = modelKindsFor(unit)
      const replacementPairs = unit.vs
        ? new Map<string, ReplacementSource[]>()
        : legalReplacementPairs(unit.entryId, catalogueTreeOf(unit), describedChoices, models, loaded.index, { ...options, roster })
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
          grantsReserveExemptionIn(findEnhancementDescription(enhancementDescriptions, chosen, enhancement), loaded.index.textFacts),
        )
      // A VS pick's allegiance is no wargear, but the roster names it beside its wargear as it names a catalogue mark.
      const allegiance = unit.vs?.unit.allegiance && vsDefinitions?.get('allegiance', unit.vs.unit.allegiance)?.name
      const wargear = unit.vs
        ? [...unit.vs.wargear, ...(allegiance ? [{ name: allegiance, count: 1 }] : [])]
        : heldWargear(models, choices, catalogued)
      const specialWargear = new Set(
        unit.choices.flatMap((choice) =>
          specialKind(choice, upgradeNames)
            ? choiceOptionsForPricing(choice)
                .filter((option) => option.count > 0)
                .flatMap((option) =>
                  choiceOptionWargear(choice.key, option.id, catalogueTreeOf(unit), loaded.index, options).map((piece) =>
                    routeSlug(piece.name),
                  ),
                )
            : [],
        ),
      )
      const built = remember(builtAttachments, unit.source, () => attachmentPartyOf(definition, loaded.index, catalogueTreeOf(unit)))
      const held = unit.vs
        ? wargear
        : wargear.filter((piece) => !specialSelections.has(routeSlug(piece.name)) || specialWargear.has(routeSlug(piece.name)))
      const modelLines = remember(builtModelLines, unit.source, () =>
        modelLinesOf(
          unit.vs?.carriers ?? combatCarriers(catalogueTreeOf(unit), loaded.index, options),
          held,
          unit.size.models,
          datasheetIn(loaded, catalogueId, unit.entryId),
          loaded.index.textFacts,
        ),
      )
      const attachment = { ...built, attachment: inArmy(built.attachment, army, unitKeywords) }
      return {
        key: unit.key,
        entryId: unit.entryId,
        name: unit.name,
        points: selectionPoints.get(catalogueTreeOf(unit)) ?? 0,
        size: {
          min: unit.size.min,
          max: unit.size.max,
          models: unit.size.models,
          options: unit.size.options,
          resizable: unit.size.max > unit.size.min,
        },
        ...deployment,
        ...(grantPicks.length ? { grantPicks } : {}),
        ...(strategicReserveExempt ? { strategicReserveExempt: true } : {}),
        ...(unitKeywords.some((keyword) => keyword.toLowerCase() === 'transport') ? { transport: true } : {}),
        // Wargear above reads the printed names; the list says what an upgrade is under its own heading.
        choices: choices.map((choice) =>
          choice.kind === 'upgrade'
            ? { ...choice, options: choice.options.map((option) => ({ ...option, name: withoutUpgrade(option.name) })) }
            : choice,
        ),
        models,
        ...(modelLines ? { modelLines } : {}),
        toggles: unit.toggles,
        // A VS pick's own records, which the builder edits it against on the device.
        ...(vsDefinitions && unit.vs ? { vs: vsUnitRecords(vsDefinitions, unit.vs.unit.unit) ?? undefined } : {}),
        enhancements: selectedEnhancements,
        upgrades,
        wargear: held,
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

/**
 * The Force Disposition a list names, if any. A list only offers cards: a player picks one at each battle's Mission step,
 * or when sealing it for an event, so naming none of several is a list's normal state, not a problem.
 */
export function resolveDisposition(allowed: readonly string[], selected: string | null) {
  return allowed.includes(selected ?? '') ? selected : allowed.length === 1 ? allowed[0]! : null
}

/** How many units a pick takes, how close to its bearer, and whether its text limits them further. */
const pickBounds = ({ count, withinInches, limited }: PickedGrant) => ({
  ...(count ? { count } : {}),
  ...(withinInches ? { withinInches } : {}),
  ...(limited ? { limited } : {}),
})
