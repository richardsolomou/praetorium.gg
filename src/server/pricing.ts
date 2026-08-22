import { attachmentErrors, attachmentOf } from '../core/attach'
import { routeSlug } from '../core/slug'
import { detachmentPointBudget, detachmentPointsError, formatDatasheetLimit, isKotcLimit } from '../core/battle'
import { targetOf } from '../core/catalogue'
import { evaluate, evaluateForces, type Selection } from '../core/evaluate'
import { type ModelKind, modelKindsOf } from '../core/modelKinds'
import { buildUnit } from '../core/roster'
import { modelCountOf } from '../core/unitSize'
import { wargearOf } from '../core/wargear'
import { app } from './app'
import { datasheetIn, rulesReferencedIn } from './catalogue'
import { detachmentCatalogueDetail } from './catalogueDescriptions'
import { groupOfEntry } from './cataloguePicker'
import { rosterDetachments } from './rosterDetachments'
import { type LoadedCatalogue } from './catalogueIndex'
import { compositionOf, type LoadedRules, rulesFaction, type UnitComposition } from './rules'
import type { PriceInput } from './schemas'
import { descriptionKey, findDescription, type FactionRestrictions } from './wahapedia'

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

export function calculateRosterPrice(data: PriceInput) {
  const loaded = app().catalogue()
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
    const named = [...(detail?.enhancements ?? []), ...(detail?.upgrades ?? [])]
    const catalogue = detachmentCatalogueDetail(
      loaded,
      data.catalogueId,
      option.id,
      named.map((enhancement) => enhancement.name),
    )
    return { option, detail, named, catalogue }
  })
  const enhancementDescriptions = new Map(
    detachmentSpecials.flatMap(({ option, named, catalogue }) => [
      ...named.flatMap((enhancement) => {
        const description =
          catalogue?.enhancements.find((candidate) => candidate.name.toLocaleLowerCase() === enhancement.name.toLocaleLowerCase())
            ?.description ?? enhancement.description
        return description ? [[descriptionKey(option.name, enhancement.name), description] as const] : []
      }),
      ...(catalogue?.forcedEnhancements.flatMap((enhancement) =>
        enhancement.description ? [[descriptionKey(option.name, enhancement.name), enhancement.description] as const] : [],
      ) ?? []),
    ]),
  )
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
  const selections = [...forceSelections.values()].flat()
  const whole = evaluateForces([...forceSelections.values()], loaded.index, options)
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
      : []
  /**
   * Units the catalogue builds itself, model for model, per squad size.
   *
   * It offers the player no choice inside them, so a limit broken inside one was
   * broken by the catalogue's own composition rather than by anything a player did
   * or could undo. The rules source states the same model counts and the price
   * agrees with them, so there is nothing here for a player to act on and nothing
   * worth telling them about.
   *
   * Only what the catalogue puts there by itself, which is why this reads the unit
   * built with no choices at all rather than the one in the list: an enhancement the
   * player picked is inside that unit too, and its own limits are theirs to answer
   * for — two of the same relic in one army is a mistake worth being told about.
   */
  const composedByCatalogue = new Map<string, string>()
  for (const unit of picked) {
    if (modelKindsOf(unit.entryId, unit.selection, loaded.index, options).length) continue
    if (!compositionOf(rules, unit.name)) continue
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

  // The 10e catalogue wrapper caps detachments at one; the 11e rules source
  // replaces that constraint with the DP budget checked above.
  const reported = [
    ...whole.errors.filter(
      (error) =>
        !(chosen.length > 1 && error.entryName.toLowerCase().includes('detachment') && error.message.includes('allows at most 1, has ')) &&
        !selfContradictory.has(error),
    ),
    ...attachmentErrors(data.units, loaded.index),
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
      const choices: ((typeof unit.choices)[number] & { kind?: 'enhancement' | 'upgrade' })[] = unit.choices.map((choice) => {
        if (!choice.name.toLowerCase().includes('enhancement')) return choice
        const choiceOptions = choice.options ?? []
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
      const specialChoices = new Set(
        choices
          .filter((choice) => choice.kind)
          .flatMap((choice) => choice.options.filter((option) => option.count > 0).map((option) => routeSlug(option.name))),
      )
      const catalogued = wargearOf(unit.selection, loaded.index)
      const automaticEnhancements = catalogued.filter((piece) => enhancementNames.has(routeSlug(piece.name))).map((piece) => piece.name)
      const specialSelections = new Set([...specialChoices, ...automaticEnhancements.map(routeSlug)])
      const models = unitModels(
        unit.entryId,
        unit.selection,
        unit.name,
        loaded,
        rules,
        options,
        catalogued,
        data.units[unit.key]?.swaps ?? {},
        unit.choices,
      )
      const wargear = heldWargear(models, unit.choices, catalogued)
      return {
        key: unit.key,
        entryId: unit.entryId,
        name: unit.name,
        points: evaluate([unit.selection], loaded.index, options).points,
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
        // Only for the datasheets the catalogue describes no kinds for: their weapons
        // are named by the rules source, so their profiles have to come from there too.
        ...(modelKindsOf(unit.entryId, unit.selection, loaded.index, options).length
          ? { modelWeapons: [], modelKeywordRules: [], modelAbilities: [] }
          : compositionExtras(compositionOf(rules, unit.name), rules, loaded)),
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
        attachment: attachmentOf(loaded.index.definitions.get(unit.entryId) ?? { id: unit.entryId }, loaded.index),
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
    const name = unit.name.trim().toLowerCase()
    const keyword = unit.keywords.find((candidate) => restrictions.excludedKeywords.has(candidate.trim().toLowerCase()))
    if (!restrictions.excludedNames.has(name) && !keyword) return []
    return [{ entryId: unit.entryId, entryName: unit.name, message: `is not allowed in this faction${keyword ? ` (${keyword})` : ''}` }]
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
    if (hasKeyword(unit, 'epic hero')) add('does not allow Epic Heroes', unit)
    if (unit.toughness === null) add('cannot verify its Toughness from the synced catalogue', unit)
    else if (unit.toughness > 9) add(`does not allow Toughness ${unit.toughness}`, unit)
  }
  const toughnessNine = units.filter((unit) => unit.toughness === 9)
  if (toughnessNine.length > 1) add(`allows at most 1 Toughness 9 unit, has ${toughnessNine.length}`)
  const byDatasheet = new Map<string, KotcUnit[]>()
  for (const unit of units) byDatasheet.set(unit.entryId, [...(byDatasheet.get(unit.entryId) ?? []), unit])
  for (const copies of byDatasheet.values()) {
    const allowance = formatDatasheetLimit(
      limit,
      copies.some((unit) => hasKeyword(unit, 'battleline') || hasKeyword(unit, 'dedicated transport')),
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
 * What the rules source knows about the weapons a composition names, in the shapes
 * the datasheet panel already draws.
 *
 * Three separate things, because a datasheet says three separate things: what a
 * weapon does, what its keywords mean, and what a piece of wargear that has no
 * profile at all does. A shield is the last of those — it has a rule and no stats.
 */
function compositionExtras(composition: UnitComposition | null, rules: LoadedRules | null, loaded: LoadedCatalogue) {
  const profiles = weaponProfiles(composition, rules)
  const named = composition
    ? [
        ...composition.models.flatMap((model) => model.weapons),
        ...(composition.options ?? []).flatMap((option) => [...option.gives, ...option.takes.flat()]),
      ]
    : []

  // Keyword rules live in the game system rather than on any one datasheet, so a
  // keyword only linked where some catalogue weapon happened to reference it.
  const keywords = new Set(profiles.flatMap((profile) => keywordsOf(profile).map((keyword) => keyword.toLocaleLowerCase())))
  const modelKeywordRules: { name: string; description: string }[] = []
  for (const rule of loaded.index.rules.values()) {
    if (!rule.name || !rule.description) continue
    const key = rule.name.trim().toLocaleLowerCase()
    if (!keywords.has(key) || modelKeywordRules.some((found) => found.name.toLocaleLowerCase() === key)) continue
    modelKeywordRules.push({ name: rule.name, description: rule.description })
  }

  // Wargear with no profile still has a rule, and only the description source has it.
  const abilitiesByName = new Map<string, { id: string; name: string; description: string; kind: 'wargear' }>()
  for (const weapon of named) {
    const description = rules?.abilityDescriptions.get(routeSlug(weapon.name))
    if (!description || profiles.some((profile) => profile.name === weapon.name)) continue
    const key = routeSlug(weapon.name)
    if (!abilitiesByName.has(key)) {
      abilitiesByName.set(key, { id: `wargear-${weapon.id}`, name: weapon.name, description, kind: 'wargear' })
    }
  }
  const modelAbilities = [...abilitiesByName.values()]

  return { modelWeapons: profiles, modelKeywordRules, modelAbilities }
}

/** The keyword names a drawn profile carries, which sit in one comma-joined value. */
const keywordsOf = (profile: { values: { name: string; value: string }[] }) =>
  (profile.values.find((value) => value.name === 'Keywords')?.value ?? '')
    .split(',')
    .map((keyword) => keyword.trim())
    // "Anti-Infantry 4+" and "Sustained Hits 1" are the keyword plus its parameter.
    .map((keyword) => keyword.replace(/\s+\d+\+?$/, ''))
    .filter(Boolean)

/**
 * Every weapon a composition names, shaped the way a datasheet profile is drawn.
 *
 * The catalogue is silent about these units' weapons, so the source that names them
 * is also the one that says what they do. Multi-profile weapons keep each profile,
 * which is how a plasma incinerator shows both its settings.
 */
function weaponProfiles(composition: UnitComposition | null, rules: LoadedRules | null) {
  if (!composition || !rules) return []
  const wanted = new Set(
    [
      ...composition.models.flatMap((model) => model.weapons),
      ...(composition.options ?? []).flatMap((option) => [...option.gives, ...option.takes.flat()]),
    ].map((weapon) => weapon.id),
  )
  const found: { id: string; name: string; type: string; values: { name: string; value: string }[] }[] = []
  for (const [id, weapon] of rules.weapons ?? []) {
    if (!wanted.has(id)) continue
    weapon.profiles.forEach((profile, at) => {
      const shown = weapon.profiles.length > 1 && profile.name !== weapon.name ? `${weapon.name} (${profile.name})` : weapon.name
      if (found.some((candidate) => candidate.name === shown)) return
      found.push({
        id: `${id}-${at}`,
        name: shown,
        type: profile.melee ? 'Melee Weapons' : 'Ranged Weapons',
        values: [{ name: 'Range', value: profile.range }, ...profile.stats, { name: 'Keywords', value: profile.keywords.join(', ') }],
      })
    })
  }
  return found
}

/**
 * The kinds of model a unit is drawn as.
 *
 * The catalogue we price from is asked first, because what it offers can be changed:
 * its groups are what a stepper writes to. Where it describes no kinds at all — a
 * datasheet whose loadouts are fixed per squad size rather than chosen — the rules
 * source is asked instead, and those kinds are shown without controls, which is the
 * honest reading: there is nothing there for a player to decide.
 */
/**
 * What a unit is carrying, counted the way its loadout is drawn.
 *
 * The roster card and the loadout panel answer the same question, so they read the
 * same fold: a swap the catalogue knows nothing about changes what a squad holds, and
 * a card reading the catalogue's own selection would go on naming the weapon that was
 * traded away. Anything the model kinds never mention — an enhancement, a choice that
 * belongs to the unit rather than to one of its models — is still the catalogue's to
 * report, and is carried through untouched.
 */
export function heldWargear(
  models: readonly ModelKind[],
  choices: readonly { key: string; options: readonly { id: string; count: number }[] }[],
  catalogued: readonly { name: string; count: number }[],
): { name: string; count: number }[] {
  if (!models.length) return [...catalogued]
  const countOf = (choiceKey: string, optionId: string) =>
    choices.find((choice) => choice.key === choiceKey)?.options.find((option) => option.id === optionId)?.count ?? 0
  const held = new Map<string, { name: string; count: number }>()
  const named = new Set<string>()
  const add = (name: string, count: number) => {
    named.add(routeSlug(name))
    if (count <= 0) return
    const seen = held.get(routeSlug(name))
    if (seen) seen.count += count
    else held.set(routeSlug(name), { name, count })
  }

  for (const kind of models) {
    const bodies = kind.members.reduce(
      (total, member) => total + (member.choiceKey ? countOf(member.choiceKey, member.id) : member.baseCount),
      0,
    )
    for (const piece of kind.fixed) add(piece.name, piece.count ?? bodies)
    for (const row of kind.rows) add(row.name, countOf(row.choiceKey, row.optionId))
    for (const swap of kind.swaps ?? []) for (const take of swap.takes) add(take, swap.count)
  }
  for (const piece of catalogued) if (!named.has(routeSlug(piece.name))) add(piece.name, piece.count)
  return [...held.values()]
}

function unitModels(
  entryId: string,
  selection: Selection,
  name: string,
  loaded: NonNullable<ReturnType<ReturnType<typeof app>['catalogue']>>,
  rules: LoadedRules | null,
  options: { primaryCatalogueId?: string },
  wargear: readonly { name: string; count: number }[],
  chosenSwaps: Readonly<Record<string, number>>,
  choices: readonly { options: readonly { name: string }[] }[],
): ModelKind[] {
  const offered = modelKindsOf(entryId, selection, loaded.index, options)
  if (offered.length) return offered

  const composition = compositionOf(rules, name)
  if (!composition) return []
  // Only where the rules source knows kinds the catalogue does not. A squad of one
  // kind of model is one the catalogue describes perfectly well — Immortals are ten
  // Immortals choosing between two guns — and naming its weapons here as well would
  // draw each of them twice, once as something carried and once as something to pick.
  if (composition.models.length < 2) return []
  // Nor may a kind claim a weapon the catalogue offers as a choice, for the same
  // reason: the choice is what the player acts on.
  const chooseable = new Set(choices.flatMap((choice) => choice.options.map((option) => routeSlug(option.name))))
  if (composition.models.some((model) => model.weapons.some((weapon) => chooseable.has(routeSlug(weapon.name))))) return []
  /**
   * Which kind a swap belongs to.
   *
   * What it replaces says it best: the model that gives up a stalker bolt rifle is
   * the one holding a stalker bolt rifle. A swap names the kind loosely — "Deathwatch
   * Veteran", where the kinds are a veteran *with* each weapon — and a sergeant who
   * shares that profile would otherwise be offered his squad's options.
   */
  const optionsFor = (model: { name: string; profile: string | null; weapons: { id: string }[] }) =>
    (composition.options ?? []).filter((option) => {
      const carried = new Set(model.weapons.map((weapon) => weapon.id))
      if (option.gives.length) return option.gives.every((weapon) => carried.has(weapon.id))
      return !option.model || option.model === model.name || option.model === model.profile
    })

  const held = new Map(wargear.map((piece) => [piece.name.toLocaleLowerCase(), piece.count]))
  const listedBy = new Map<string, number>()
  for (const model of composition.models) {
    for (const weapon of model.weapons) {
      const key = weapon.name.toLocaleLowerCase()
      listedBy.set(key, (listedBy.get(key) ?? 0) + 1)
    }
  }
  const modelsInUnit = modelCountOf(selection, loaded.index)
  const tier = composition.tiers?.find((candidate) => {
    const minimum = candidate.models.reduce((total, model) => total + model.min, 0)
    const maximum = candidate.models.reduce((total, model) => total + model.max, 0)
    return modelsInUnit >= minimum && modelsInUnit <= maximum
  })

  return composition.models.map((model) => {
    // A weapon only this kind carries counts the kind: one stalker bolt rifle in the
    // squad is one veteran holding it. Where every weapon is shared with a sibling
    // there is nothing to count by, and the datasheet's own minimum is the answer.
    const own = model.weapons.flatMap((weapon) => {
      const key = weapon.name.toLocaleLowerCase()
      const count = listedBy.get(key) === 1 ? held.get(key) : undefined
      return count === undefined ? [] : [count]
    })
    const tierModel = tier?.models.find((candidate) => candidate.name === model.name)
    const count = own.length ? Math.min(...own) : (tierModel?.min ?? model.min)
    const mine = optionsFor(model)
    const taken = (option: (typeof mine)[number], at: number) => chosenSwaps[`${option.id}#${at}`] ?? 0

    // A swap spends one of this kind's bodies, and the weapon it replaces loses one
    // with it. Every alternative is listed whether taken or not, so the card keeps
    // the same shape as a squad is put together.
    const swaps = mine.flatMap((option) =>
      option.takes.map((take, at) => {
        const spent = mine.reduce(
          (total, other) =>
            total + other.takes.reduce((sum, _, index) => sum + (other === option && index === at ? 0 : taken(other, index)), 0),
          0,
        )
        return {
          key: `${option.id}#${at}`,
          gives: option.gives.map((weapon) => weapon.name),
          takes: take.map((weapon) => weapon.name),
          count: option.free ? taken(option, at) : 0,
          max: option.free ? Math.max(0, count - spent) : 0,
          free: option.free,
        }
      }),
    )

    // What a weapon is down to once swaps have taken their share of it.
    const lost = new Map<string, number>()
    for (const swap of swaps) {
      for (const given of swap.gives) lost.set(given, (lost.get(given) ?? 0) + swap.count)
    }

    return {
      name: model.name,
      fixed: model.weapons.map((weapon) => ({ name: weapon.name, count: Math.max(0, count - (lost.get(weapon.name) ?? 0)) })),
      members: [{ id: model.name, choiceKey: null, baseCount: count }],
      rows: [],
      swaps,
    }
  })
}

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

export function resolveDisposition(allowed: readonly string[], selected: string | null) {
  const disposition = allowed.includes(selected ?? '') ? selected : allowed.length === 1 ? allowed[0] : null
  return { disposition, error: allowed.length > 1 && !disposition ? 'Pick a disposition.' : null }
}
