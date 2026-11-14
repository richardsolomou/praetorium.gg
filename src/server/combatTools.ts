import { z } from 'zod'
import type { CombatResult, CombatPhase } from '../core/combat'
import { combatAdjustmentsSchema } from '../core/combatAdjustments'
import {
  combatMatchup,
  noExclusions,
  resolveCombatRequest,
  strongestWeaponPreferences,
  type CombatantSnapshot,
} from '../core/combatMatchup'
import {
  combatEffectAppliesTo,
  combatRuleAppliesTo,
  combatDamageStateSelections,
  combatRuleChoices,
  combatRuleKey,
  ruleRoles,
  combatRuleSelections,
  type CombatRule,
} from '../core/combatRules'
import { admitsHost, attachmentOf } from '../core/attach'
import { unquotedLabel } from '../core/combatReading'
import { combatUnitKeywords, type CombatMember } from '../core/combatUnit'
import type { RosterPick } from '../core/roster'
import { rosterPickSchema } from '../core/commands'
import type { UnavailableSelection } from '../core/rosterSelections'
import { combatAtHealth } from '../core/combatSurvivors'
import { combatTarget } from '../core/combatProfiles'
import { encodeSimulatorState } from '../contracts/simulatorState'
import { joinKey } from '../core/text'
import { fuzzyNameScore } from '../core/datasheetSearch'
import { hasTextTokens } from '../core/sourceText'
import type { ToolErrorType } from '../contracts/agentTools'
import { READ_ONLY_TOOL, structured, toolError, type AgentTools } from './agentTools'
import { app, type App } from './app'
import { combatantSnapshot, readRules, withReadRules } from '../shared/rosterGradeMeasures'
import {
  applyOptimizedLoadout,
  compareOutcomes,
  type LoadoutCandidates,
  type LoadoutOptimization,
  type LoadoutScoring,
  type OptimizedLoadout,
} from '../core/combatLoadouts'
import { createCombatWorker, type OptimizeLoadoutMessage, type OptimizeLoadoutReply } from './combatCalculationPool'
import { combatLoadoutCandidates } from '../shared/combatLoadouts'
import { rosterCombatant } from '../shared/rosterCombatRules'
import { serverWords } from './publishedTextFiles'
import { activeReferenceCorpus, currentFactionIds } from './referenceApi'
import type { ReferenceCorpus } from './referenceCorpus'
import { datasheetCitation, factionDatasheets, factionUnits, referenceFaction } from './referenceService'
import type { LoadedCatalogue } from '../shared/catalogueIndex'
import type { LoadedRules } from '../shared/rules'
import { rosterDatasheetSelections } from '../shared/rosterDatasheetContext'
import { calculateRosterPrice } from '../shared/pricing'

/**
 * Estimates run synchronously on the shared server, so this is 400 times below the browser worker's bound, about
 * 150 ms of calculation; full-size infantry matchups need a tenth of it.
 */
const COMBAT_TOOL_MAX_WORK = 5_000_000
const MAX_ATTACHED = 2
const MAX_NEARBY = 3

type Role = 'attacker' | 'defender'

const name = z.string().trim().min(1).max(400)
const ruleChoicesSchema = z
  .record(z.string().max(400), z.int().min(0).max(20))
  .refine((choices) => Object.keys(choices).length <= 60, 'Choose at most 60 rules.')
const memberShape = {
  unit: name.describe('Unit id, slug, name, or referenceId from list_units.'),
  models: z.int().min(1).max(60).optional().describe('Model count; must be a legal unit size. Defaults to the minimum size.'),
  enhancement: name
    .optional()
    .describe(
      "Enhancement name from list_units for the side's detachment, given to this unit's character; it needs that detachment named.",
    ),
  choices: rosterPickSchema.shape.choices.describe(
    "Wargear choices, choice key to option id from get_unit_options or a get_my_roster pick: pass that pick's entryId as unit with its models, choices and spreads unchanged. An enhancement among them needs the side's detachment named. Omitted, the unit takes its default loadout.",
  ),
  spreads: rosterPickSchema.shape.spreads.describe(
    'How many models take each option of a choice group, choice key to {option id: count}, for groups get_unit_options sets with spreads.',
  ),
  modelsLost: z
    .int()
    .min(1)
    .max(59)
    .optional()
    .describe(
      'Models already destroyed; at least one must remain, so leave out a destroyed attached unit. Refused when its models carry different wargear, since which ones fell is unknown.',
    ),
  woundsLost: z
    .int()
    .min(1)
    .max(99)
    .optional()
    .describe("Wounds lost by the unit's one wounded model, fewer than its Wounds; damage-state rules follow it on a lone model."),
}
const otherUnit = z.object({
  ...memberShape,
  faction: z.string().trim().min(1).max(160).optional().describe("Defaults to the unit's faction."),
})
const nearbyUnit = otherUnit.pick({ unit: true, faction: true, enhancement: true })
const sideSchema = z.object({
  faction: z.string().trim().min(1).max(160).describe('Faction id, URL slug, or display name from list_reference or list_units.'),
  ...memberShape,
  attached: z
    .array(otherUnit)
    .max(MAX_ATTACHED)
    .optional()
    .describe(
      'Leaders or support units joined to the unit, from its canBeLedBy and canBeSupportedBy. A unit that joins one of these instead, such as Nork Deddog joining a Cadian Command Squad, goes after it.',
    ),
  nearby: z
    .array(nearbyUnit)
    .max(MAX_NEARBY)
    .optional()
    .describe(
      'Friendly units near this one but not joined to it, such as a character whose aura reaches it. Their abilities that can affect this unit are offered as rules, off until chosen; the simulator link leaves them out.',
    ),
  detachment: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .optional()
    .describe('Detachment id, slug, or name from list_units, to field its rules and offer its stratagems; omit it for none.'),
  rules: ruleChoicesSchema
    .optional()
    .describe('Rule choices by rule id from a previous result: 0 turns a rule off and n selects its nth option.'),
})
const simulateCombatInputSchema = z.object({
  attacker: sideSchema,
  defender: sideSchema,
  modifiers: combatAdjustmentsSchema
    .optional()
    .describe(
      'Situational modifiers the simulator page offers, such as { "all": { "cover": true, "hitModifier": -1 } }, { "melee": { "charged": true } }, or { "target": { "invulnerable": 4 } }. commandReroll spends one Command Re-roll per phase on the first failed hit, wound, or save roll, or the first single-die Attacks roll below its average; compare with a run without it to judge the CP.',
    ),
  weaponModes: z
    .record(z.string().max(400), z.string().max(200))
    .refine((modes) => Object.keys(modes).length <= 60, 'Choose at most 60 weapon modes.')
    .optional()
    .describe(
      'Weapon mode choices by key from a previous result, such as a frag or krak profile or which melee weapon a model fights with; a choice left out takes the option that does most against the defender.',
    ),
})
type SimulateCombatInput = z.infer<typeof simulateCombatInputSchema>
type SideInput = z.infer<typeof sideSchema>

/** Why the named sides cannot be built; each reason names the faction, unit, size, or attachment at fault. */
export class CombatRefusal extends Error {
  constructor(
    readonly reasons: string[],
    readonly type: ToolErrorType = 'refused',
  ) {
    super(reasons.join(' '))
  }
}

function refused(reasons: readonly string[], type: ToolErrorType) {
  const unique = [...new Set(reasons)]
  return toolError(type, `The simulator cannot estimate this matchup: ${unique.join(' ')}`, { refused: unique })
}

const only = <T>(items: readonly T[]) => (items.length === 1 ? items[0] : undefined)

const REFERENCE_UNAVAILABLE = 'Praetorium reference data is temporarily unavailable.'

const round = (value: number) => Math.round(value * 10_000) / 10_000

function outcome(result: CombatResult) {
  let remaining = 1
  const atLeast = result.kills.map((chance) => {
    const value = remaining
    remaining -= chance
    return round(Math.max(0, value))
  })
  return {
    expectedModelsDestroyed: round(result.meanKills),
    ...(result.uncappedKills === undefined ? {} : { expectedKillsUncapped: round(result.uncappedKills) }),
    expectedWoundsLost: round(result.meanDamage),
    ...(result.uncappedDamage === undefined ? {} : { expectedDamageUncapped: round(result.uncappedDamage) }),
    destroyedChance: round(result.wipe),
    atLeastModelsDestroyedChance: atLeast,
  }
}

/** Where the simulator reads catalogues: the server's, or a snapshot a script loaded. */
export type CombatCatalogues = Pick<App, 'catalogueFor' | 'rulesFor' | 'combatUnitsFor'> & {
  currentFactionIds: () => Promise<ReadonlySet<string>>
}

function serverCatalogues(): CombatCatalogues {
  const instance = app()
  return {
    catalogueFor: (catalogueId) => instance.catalogueFor(catalogueId),
    rulesFor: (catalogueId) => instance.rulesFor(catalogueId),
    combatUnitsFor: () => instance.combatUnitsFor(),
    currentFactionIds: () => currentFactionIds(),
  }
}

/** The unit a faction's lists can take by the id, slug, reference id or name an agent gives, refusing one they cannot. */
export async function namedUnit(
  corpus: ReferenceCorpus,
  factionName: string,
  unitName: string,
  catalogues: CombatCatalogues = serverCatalogues(),
) {
  const faction = referenceFaction(corpus, factionName)
  if (!faction) throw new CombatRefusal([`No faction is named ${factionName}; use a name or id from list_factions.`], 'not_found')
  const [loaded, rules, current] = await Promise.all([
    catalogues.catalogueFor(faction.id),
    catalogues.rulesFor(faction.id),
    catalogues.currentFactionIds(),
  ])
  if (!loaded) throw new CombatRefusal([REFERENCE_UNAVAILABLE], 'unavailable')
  // The units list_units offers with Legends and Crucible included, so a chapter fields the codex units its lists can take.
  const units = factionUnits(loaded, rules, faction, { nonMatchedPlay: true })
  const sheets = factionDatasheets(corpus, loaded, faction.id, current)
  const wanted = unitName.toLocaleLowerCase()
  const key = joinKey(unitName)
  const matches = units.filter((candidate) => {
    const sheet = sheets.get(candidate.id)
    return (
      [candidate.id, candidate.slug, sheet?.slug, datasheetCitation(corpus, sheet).referenceId].some(
        (value) => value?.toLocaleLowerCase() === wanted,
      ) || joinKey(candidate.name) === key
    )
  })
  // A chapter's own character and its codex copy can share a name; the chapter's own entry wins.
  const unit = matches.length > 1 ? only(matches.filter((candidate) => sheets.get(candidate.id)?.catalogueId === faction.id)) : matches[0]
  if (!unit && matches.length)
    throw new CombatRefusal(
      [
        `${faction.name} has several units named ${unitName}: ${matches.map((candidate) => candidate.id).join(', ')}. Pass one of these ids.`,
      ],
      'not_found',
    )
  if (!unit) {
    const stem = key.length > 4 ? key.replace(/s$/, '') : key
    const similar = units
      .filter((candidate) => (stem && joinKey(candidate.name).includes(stem)) || fuzzyNameScore(unitName, candidate.name) !== null)
      .map((candidate) => candidate.name)
    throw new CombatRefusal(
      [
        `${faction.name} has no unit named ${unitName}.${similar.length ? ` Similar units: ${similar.slice(0, 5).join(', ')}.` : ''} Use a unit name or id from list_units for this faction.`,
      ],
      'not_found',
    )
  }
  return { faction, unit, sheet: sheets.get(unit.id), loaded, rules }
}

/** The picks a side names, refusing a faction the simulator does not offer or a unit its lists cannot take. */
async function sidePicks(corpus: ReferenceCorpus, side: SideInput, catalogues: CombatCatalogues) {
  const shelves = await catalogues.combatUnitsFor()
  const resolve = async (factionName: string, unitName: string) => {
    const found = await namedUnit(corpus, factionName, unitName, catalogues)
    if (!shelves.some((shelf) => shelf.catalogueId === found.faction.id))
      throw new CombatRefusal([`The simulator does not offer ${found.faction.name}.`], 'not_found')
    return found
  }
  const host = await resolve(side.faction, side.unit)
  const attached = side.attached ?? []
  const others = [...attached, ...(side.nearby ?? [])]
  const found = await Promise.all(others.map((member) => resolve(member.faction ?? side.faction, member.unit)))
  const fielded = (member: Partial<Pick<SideInput, 'models' | 'choices' | 'spreads'>> = {}) => ({
    ...(member.models ? { models: member.models } : {}),
    ...(member.choices ? { choices: member.choices } : {}),
    ...(member.spreads ? { spreads: member.spreads } : {}),
  })
  const picks: RosterPick[] = [
    { entryId: host.unit.id, catalogueId: host.faction.id, ...fielded(side) },
    ...found.map((member, index) => ({
      entryId: member.unit.id,
      catalogueId: member.faction.id,
      ...(index < attached.length ? { attachedTo: 0 } : {}),
      ...fielded(attached[index]),
    })),
  ]
  return {
    catalogueId: host.faction.id,
    picks,
    sheets: [host.sheet, ...found.map((member) => member.sheet)],
    enhancements: [side.enhancement, ...others.map((member) => member.enhancement)],
    members: 1 + attached.length,
  }
}

/** Each attached unit joins the main unit, or else the first attached unit before it that can take it, as a Loyal Protector joins a Command Squad. */
function joinedPicks(loaded: LoadedCatalogue, catalogueId: string, detachmentIds: string[], picks: readonly RosterPick[]): RosterPick[] {
  const built = rosterDatasheetSelections(loaded, { catalogueId, detachmentIds, picks: [...picks] })
  const admits = (member: number, host: number) => {
    const definition = loaded.index.definitions.get(picks[member]!.entryId)
    const unit = built.unitSelections.find((candidate) => candidate.pickIndex === member)
    const attachment = definition && attachmentOf(definition, loaded.index, unit && built.selections[unit.selectionIndex])
    const hostName = loaded.index.definitions.get(picks[host]!.entryId)?.name ?? picks[host]!.entryId
    return Boolean(attachment && admitsHost(attachment, hostName))
  }
  return picks.map((pick, at) =>
    at && pick.attachedTo !== undefined
      ? { ...pick, attachedTo: [...picks.keys()].slice(0, at).find((host) => admits(at, host)) ?? 0 }
      : pick,
  )
}

const sidePrice = (loaded: LoadedCatalogue, rules: LoadedRules | null, catalogueId: string, detachmentIds: string[], units: RosterPick[]) =>
  calculateRosterPrice({ catalogueId, detachmentIds, disposition: null, limit: 2_000, units }, loaded, rules)

/**
 * Refuses wargear choices the catalogue would drop or that break their unit's limits. Each member's choices are priced
 * against every member at its default loadout, whose own errors belong to the short list, such as its missing Warlord.
 */
function refuseIllegalLoadouts(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  catalogueId: string,
  detachmentIds: string[],
  picks: readonly RosterPick[],
) {
  if (!picks.some((pick) => pick.choices || pick.spreads)) return
  const defaults = picks.map(({ choices: _choices, spreads: _spreads, ...pick }) => pick)
  const errors = (units: RosterPick[]) => sidePrice(loaded, rules, catalogueId, detachmentIds, units)?.errors ?? []
  const said = (error: { entryId: string; message: string }) => JSON.stringify([error.entryId, error.message])
  const baseline = new Set(errors(defaults).map(said))
  const reasons = picks.flatMap((pick, index) => {
    if (!pick.choices && !pick.spreads) return []
    const problems = errors(defaults.with(index, pick))
      .filter((error) => !baseline.has(said(error)))
      .flatMap((error) => {
        const unavailable: UnavailableSelection[] = 'unavailable' in error && Array.isArray(error.unavailable) ? error.unavailable : []
        return unavailable.length
          ? unavailable.map((problem) => `it has no option ${problem.optionId} under ${problem.key}`)
          : [`${error.entryName} ${error.message}`]
      })
    const unit = loaded.index.definitions.get(pick.entryId)?.name ?? pick.entryId
    return problems.length ? [`${unit} cannot take these wargear choices: ${problems.join('; ')}.`] : []
  })
  if (reasons.length) throw new CombatRefusal(reasons)
}

/** Each pick with the enhancement named for it chosen, refusing one its unit cannot take in these detachments. */
function withEnhancements(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  catalogueId: string,
  detachmentIds: string[],
  picks: RosterPick[],
  wanted: readonly (string | undefined)[],
) {
  if (!wanted.some(Boolean)) return picks
  const price = sidePrice(loaded, rules, catalogueId, detachmentIds, picks)
  return picks.map((pick, index) => {
    const enhancement = wanted[index]
    if (!enhancement) return pick
    const unit = price?.units.find((candidate) => candidate.key === index)
    const options = (unit?.choices ?? [])
      .filter((choice) => choice.kind === 'enhancement')
      .flatMap((choice) => choice.options.map((option) => ({ key: choice.key, option })))
    const found = options.find(({ option }) => joinKey(option.name) === joinKey(enhancement))
    if (!found)
      throw new CombatRefusal([
        `${unit?.name ?? pick.entryId} cannot take an enhancement named ${enhancement}. ${
          options.length
            ? `Its enhancements are: ${options.map(({ option }) => option.name).join(', ')}.`
            : `It has no enhancements${detachmentIds.length ? ' in this detachment' : ' without a detachment'}.`
        }`,
      ])
    return { ...pick, choices: { ...pick.choices, [found.key]: found.option.id } }
  })
}

/** The detachment a side names, by id, slug, or name among those its faction's lists can take. */
export function detachmentId(loaded: LoadedCatalogue, catalogueId: string, detachment: string) {
  const options = loaded.detachments.get(catalogueId)?.options ?? []
  const key = joinKey(detachment)
  const found = options.find((option) => option.id === detachment || joinKey(option.name) === key)
  if (found) return found.id
  throw new CombatRefusal(
    [
      `This faction has no detachment named ${detachment}. Its detachments are: ${options.map((option) => option.name).join(', ') || 'none'}.`,
    ],
    'not_found',
  )
}

/** One side at the health named for it, with the rules it brings and the choices an agent can make about them. */
async function combatant(corpus: ReferenceCorpus, side: SideInput, role: Role, catalogues: CombatCatalogues = serverCatalogues()) {
  const named = await sidePicks(corpus, side, catalogues)
  const [loaded, rules] = await Promise.all([catalogues.catalogueFor(named.catalogueId), catalogues.rulesFor(named.catalogueId)])
  if (!loaded) throw new CombatRefusal([REFERENCE_UNAVAILABLE], 'unavailable')
  const detachmentIds = side.detachment ? [detachmentId(loaded, named.catalogueId, side.detachment)] : []
  const joined = joinedPicks(loaded, named.catalogueId, detachmentIds, named.picks)
  refuseIllegalLoadouts(loaded, rules, named.catalogueId, detachmentIds, joined)
  const resolved = {
    ...named,
    detachmentIds,
    picks: withEnhancements(loaded, rules, named.catalogueId, detachmentIds, joined, named.enhancements),
  }
  const unread = rosterCombatant(loaded, rules, { catalogueId: resolved.catalogueId, detachmentIds, picks: resolved.picks, pickIndex: 0 })
  if (!unread) throw new CombatRefusal([`${side.unit} could not be loaded.`])
  const projection = withReadRules(unread, await serverWords())
  const requested = [side, ...(side.attached ?? [])]
  const members = [{ ...projection, pickIndex: 0 }, ...projection.companions]
  const health = members.map((member) => {
    const { modelsLost = 0, woundsLost = 0 } = requested[member.pickIndex] ?? {}
    const unit = member.selected.name
    const groups = combatTarget(member.selected, member.models, member.models, member.carriers).target?.groups ?? []
    // The engine wounds the first allocation group, so a model is named as the wounded one only when the unit has one group.
    const wounds = groups.length === 1 ? groups[0]!.wounds : undefined
    return {
      models: member.models - modelsLost,
      startingModels: member.models,
      damage: woundsLost,
      wounds,
      errors: [
        ...(modelsLost >= member.models
          ? [`${unit} has ${member.models} models, so it cannot lose ${modelsLost}; leave out a destroyed attached unit.`]
          : []),
        ...(woundsLost && groups.length > 1
          ? [`${unit} has models with different defences, so the simulator cannot tell which one lost wounds.`]
          : []),
        ...(woundsLost && wounds !== undefined && woundsLost >= wounds
          ? [`${unit} has ${wounds} wounds per model, so its wounded model cannot have lost ${woundsLost}.`]
          : []),
      ],
    }
  })
  const errors = [
    ...projection.attachmentErrors.map((error) => `${error.entryName}: ${error.message}.`),
    ...members.flatMap((member) => {
      const wanted = requested[member.pickIndex]?.models
      return wanted !== undefined && wanted !== member.models
        ? [`${member.selected.name} cannot field ${wanted} models; list_units gives its unit sizes.`]
        : []
    }),
    ...health.flatMap((member) => member.errors),
  ]
  if (errors.length) throw new CombatRefusal(errors)
  const selection = combatRuleSelections([...projection.rules, ...projection.companions.flatMap((member) => member.rules)], {
    ...Object.assign({}, ...members.map((member, index) => combatDamageStateSelections(member.rules, health[index]!))),
    ...side.rules,
  })
  const full = combatantSnapshot(projection, selection)
  const atHealth = <Member extends CombatMember>(member: Member, index: number) =>
    health[index]!.models < health[index]!.startingModels || health[index]!.damage ? combatAtHealth(member, health[index]!) : member
  const snapshot = { ...atHealth(full, 0), companions: full.companions?.map((member, at) => atHealth(member, at + 1)) }
  const ambiguous = [snapshot, ...snapshot.companions!].filter((member) => member.allocationRequired)
  if (ambiguous.length)
    throw new CombatRefusal(
      ambiguous.map(
        (member) => `${member.sheet.name} cannot lose models: its models carry different wargear, so which ones fell is unknown.`,
      ),
    )
  const price = sidePrice(loaded, rules, resolved.catalogueId, detachmentIds, resolved.picks)
  const units = resolved.sheets.slice(0, named.members).map((sheet, index) => {
    const at = members.findIndex((candidate) => candidate.pickIndex === index)
    const member = members[at]!
    const { models, startingModels, damage } = health[at]!
    const enhancement = named.enhancements[index]
    return {
      name: member.selected.name,
      models,
      ...(models < startingModels ? { startingModels } : {}),
      ...(damage ? { woundsLost: damage } : {}),
      wargear: price?.units.find((unit) => unit.key === index)?.wargear.map(({ name: piece, count }) => ({ name: piece, count })) ?? [],
      ...(enhancement ? { enhancement } : {}),
      ...datasheetCitation(corpus, sheet),
    }
  })
  const nearby = resolved.sheets.slice(named.members).map((sheet, index) => ({
    name: sheet?.name ?? side.nearby![index]!.unit,
    ...(side.nearby![index]!.enhancement ? { enhancement: side.nearby![index]!.enhancement } : {}),
    ...datasheetCitation(corpus, sheet),
  }))
  return { snapshot, units, nearby, rules: selection.rules, choices: selection.choices, resolved, role }
}

type Combatant = Awaited<ReturnType<typeof combatant>>

/**
 * A named faction's unit at full strength with its passive rules, or null when the reference data cannot field it.
 * A script passes the snapshot it loaded in place of the server's.
 */
export async function namedCombatant(
  faction: string,
  unit: string,
  models?: number,
  source?: { corpus: ReferenceCorpus; catalogues: CombatCatalogues },
): Promise<CombatantSnapshot | null> {
  const corpus = source ? source.corpus : await activeReferenceCorpus()
  if (!corpus) return null
  try {
    return (await combatant(corpus, { faction, unit, ...(models ? { models } : {}) }, 'defender', source?.catalogues)).snapshot
  } catch (error) {
    if (error instanceof CombatRefusal) return null
    throw error
  }
}

/** The rules a side can change and the recognised rules the calculation cannot apply. */
function ruleSummary(side: Combatant, opponent: Combatant) {
  const keywords = combatUnitKeywords(opponent.snapshot)
  const options = (rule: CombatRule) =>
    combatRuleChoices(rule)
      .map((choice, index) => ({ choice: index + 1, label: unquotedLabel(choice.label, rule.description), effects: choice.effects }))
      .filter((choice) => choice.effects.some((effect) => combatEffectAppliesTo(effect, side.role, keywords)))
      .map(({ choice, label }) => ({ choice, label }))
  return {
    rules: side.rules
      .filter((rule) => combatRuleAppliesTo(rule, side.role, keywords))
      .map((rule) => ({
        id: rule.id,
        name: rule.name,
        source: rule.source,
        scope: rule.scope,
        selected: side.choices[combatRuleKey(rule)] ?? 0,
        options: rule.included ? [] : options(rule),
        ...(rule.included ? { appliedInProfile: true } : {}),
      })),
    notCalculated: side.rules
      .filter(
        (rule) =>
          !rule.included &&
          !rule.appliedDefences?.length &&
          !combatRuleChoices(rule).length &&
          (ruleRoles(rule).includes(side.role) ||
            // The snapshot does not hold this card's words, so what the rule does is unknown; a stratagem stays off anyway.
            (rule.scope !== 'stratagem' && !rule.reading && hasTextTokens(rule.description))),
      )
      .map((rule) => ({ id: rule.id, name: rule.name, source: rule.source, scope: rule.scope })),
  }
}

/** Both sides built, or the tool error naming every reason either side cannot be. */
async function combatSides(corpus: ReferenceCorpus, input: Pick<SimulateCombatInput, 'attacker' | 'defender'>) {
  const sides = await Promise.allSettled([combatant(corpus, input.attacker, 'attacker'), combatant(corpus, input.defender, 'defender')])
  const refusals = sides.flatMap((side) => {
    if (side.status === 'fulfilled') return []
    if (side.reason instanceof CombatRefusal) return [side.reason]
    throw side.reason
  })
  if (refusals.length)
    return {
      error: refused(
        refusals.flatMap((refusal) => refusal.reasons),
        refusals[0]!.type,
      ),
    }
  return { sides: sides.map((side) => (side as PromiseFulfilledResult<Combatant>).value) as [Combatant, Combatant] }
}

export async function simulateCombat(input: SimulateCombatInput) {
  const corpus = await activeReferenceCorpus()
  if (!corpus) return refused([REFERENCE_UNAVAILABLE], 'unavailable')
  const built = await combatSides(corpus, input)
  if (!built.sides) return built.error
  const [attacker, defender] = built.sides
  const adjustments = input.modifiers ?? {}
  const preferences = await strongestWeaponPreferences(
    attacker.snapshot,
    defender.snapshot,
    { preferences: input.weaponModes ?? {}, excluded: noExclusions(), allocation: [] },
    adjustments,
    async (requests) => requests.map((request) => resolveCombatRequest(request, COMBAT_TOOL_MAX_WORK)),
  )
  const matchup = combatMatchup(attacker.snapshot, defender.snapshot, { preferences, excluded: noExclusions(), allocation: [] })
  const request = matchup.request(adjustments)
  const answer = resolveCombatRequest(request, COMBAT_TOOL_MAX_WORK)
  const phase = (key: CombatPhase) => {
    const plan = matchup.plans[key]!
    const weapons = plan.active.map((entry) => ({ name: entry.profile.name, count: entry.count }))
    const modes = plan.choices.map((choice) => ({ key: choice.key, label: choice.label, value: choice.value, options: choice.options }))
    const result = answer[key]
    const errors = [...(matchup.target?.error ? [matchup.target.error] : []), ...plan.errors]
    if (errors.length) return { status: 'refused' as const, reasons: errors, weapons, weaponModes: modes }
    if (!result) return { status: 'refused' as const, reasons: ['This phase could not be built.'], weapons, weaponModes: modes }
    if (result.error) return { status: 'refused' as const, reasons: [result.error], weapons, weaponModes: modes }
    if (!request[key]!.weapons.length && !request[key]!.mortalWounds?.length) return { status: 'no attacks' as const }
    return { status: 'estimated' as const, ...outcome(result.result!), weapons, weaponModes: modes }
  }
  const shooting = phase('ranged')
  const fight = phase('melee')
  const phaseRefusals = [...new Set([shooting, fight].flatMap((part) => (part.status === 'refused' ? part.reasons : [])))]
  const citations = [...attacker.units, ...defender.units]
  const documents = citations.flatMap((unit) => (unit.referenceId && corpus.byId.get(unit.referenceId)) || [])
  const result = {
    attacker: { units: attacker.units, ...(attacker.nearby.length ? { nearby: attacker.nearby } : {}), ...ruleSummary(attacker, defender) },
    defender: {
      units: defender.units,
      ...(defender.nearby.length ? { nearby: defender.nearby } : {}),
      models: matchup.target?.target?.groups.reduce((total, group) => total + group.models, 0) ?? 0,
      ...ruleSummary(defender, attacker),
    },
    shooting,
    melee: fight,
    shootingThenMelee: answer.combined?.result
      ? { status: 'estimated' as const, ...outcome(answer.combined.result) }
      : answer.combined?.error
        ? { status: 'refused' as const, reasons: [answer.combined.error] }
        : phaseRefusals.length
          ? { status: 'refused' as const, reasons: phaseRefusals }
          : { status: 'not applicable' as const },
    simulatorUrl: `/simulator?s=${encodeSimulatorState({
      v: 1,
      sides: [sharedSide(attacker, input.attacker.rules), sharedSide(defender, input.defender.rules)],
      swapped: false,
      matchup: { adjustments, preferences, excluded: noExclusions(), allocation: [] },
    })}`,
    revisions: corpus.catalogue.revisions,
    attribution: [...new Set(documents.flatMap((document) => document.attribution))],
  }
  return structured(result)
}

const optimizeLoadoutInputSchema = simulateCombatInputSchema.omit({ weaponModes: true }).extend({
  mode: z
    .enum(['combined', 'ranged', 'melee'])
    .default('combined')
    .describe('What to rank by: shooting followed by melee (combined), shooting alone (ranged), or melee alone.'),
})
type OptimizeLoadoutInput = z.infer<typeof optimizeLoadoutInputSchema>

/** How long one search may run before it reports the best loadout found as unproven. */
const OPTIMIZE_MS = 20_000
/** Of that, how long climbs from random starts may keep looking once the unit has too many loadouts to visit them all. */
const LOCAL_SEARCH_MS = 10_000
const RESTARTS = 20
const STALE_RESTARTS = 4
const WALK_STEPS = 8
/** Searches the shared server runs at once; each holds a worker's worth of calculation on its event loop. */
const MAX_OPTIMIZATIONS = 2
let optimizations = 0

/**
 * Scores loadouts in a worker of their own: one candidate can run thousands of exact calculations, which on the main
 * thread would hold every other request, and only terminating the worker stops one mid-way.
 */
function loadoutScorer(signal: AbortSignal) {
  const worker = createCombatWorker()
  const stop = () => void worker.terminate()
  signal.addEventListener('abort', stop, { once: true })
  const score = (space: LoadoutCandidates, scoring: LoadoutScoring, mode: OptimizeLoadoutMessage['mode']) =>
    new Promise<LoadoutOptimization>((resolve, reject) => {
      // Ending early reads as the core search's own limit, so the caller keeps the best found so far.
      const cut = () => {
        worker.off('message', settle)
        reject(new Error('The full search could not finish in time.'))
      }
      const settle = (reply: OptimizeLoadoutReply) => {
        worker.off('exit', cut)
        if ('error' in reply) reject(new Error(reply.error))
        else resolve(reply.optimized)
      }
      if (signal.aborted) return cut()
      worker.once('message', settle)
      worker.once('exit', cut)
      worker.postMessage({ kind: 'optimize-loadout', space, scoring, mode, maxWork: COMBAT_TOOL_MAX_WORK } satisfies OptimizeLoadoutMessage)
    })
  return Object.assign(score, {
    close: () => {
      signal.removeEventListener('abort', stop)
      stop()
    },
  })
}

/**
 * The attacking unit's legal wargear searched for the best result against the defender, as the simulator's Optimize
 * does: every loadout when there are few enough, otherwise climbs from the current loadout and random starts, which
 * never claim an optimum.
 */
export async function optimizeCombatLoadout(input: OptimizeLoadoutInput) {
  const damaged = [input.attacker, ...(input.attacker.attached ?? [])].some((member) => member.modelsLost || member.woundsLost)
  if (damaged)
    return refused(['Optimization compares loadouts at full strength; leave out modelsLost and woundsLost for the attacker.'], 'validation')
  const corpus = await activeReferenceCorpus()
  if (!corpus) return refused([REFERENCE_UNAVAILABLE], 'unavailable')
  const built = await combatSides(corpus, input)
  if (!built.sides) return built.error
  const [attacker, defender] = built.sides
  const { resolved } = attacker
  const instance = app()
  const [loaded, rules, words] = await Promise.all([
    instance.catalogueFor(resolved.catalogueId),
    instance.rulesFor(resolved.catalogueId),
    serverWords(),
  ])
  if (!loaded) return refused([REFERENCE_UNAVAILABLE], 'unavailable')
  const adjustments = input.modifiers ?? {}
  const matchup = combatMatchup(attacker.snapshot, defender.snapshot, { preferences: {}, excluded: noExclusions(), allocation: [] })
  if (input.mode === 'combined' && matchup.sequenceError) return refused([matchup.sequenceError], 'refused')
  const keywords = combatUnitKeywords(defender.snapshot)
  const scoring: LoadoutScoring = {
    sheet: attacker.snapshot.sheet,
    carriers: attacker.snapshot.carriers,
    models: attacker.snapshot.models,
    rules: matchup.attackRules,
    ruleChoices: attacker.snapshot.ruleChoices,
    companions: attacker.snapshot.companions,
    sequenceError: matchup.sequenceError,
    opponent: { keywords, rules: matchup.defenceRules },
    preferences: {},
    excluded: noExclusions(),
    phases: { ranged: matchup.phaseSetup('ranged', adjustments), melee: matchup.phaseSetup('melee', adjustments) },
    afterLosses: matchup.afterLosses.map(({ units, matchup: after }) => ({
      units,
      opponent: { keywords, rules: after.defenceRules },
      phases: { ranged: after.phaseSetup('ranged', adjustments), melee: after.phaseSetup('melee', adjustments) },
    })),
  }
  if (optimizations >= MAX_OPTIMIZATIONS) return toolError('unavailable', 'Loadout searches are busy just now. Try again shortly.')
  optimizations++
  const started = performance.now()
  const signal = AbortSignal.timeout(OPTIMIZE_MS)
  const score = loadoutScorer(signal)
  let current: OptimizedLoadout | undefined
  let best: OptimizedLoadout | undefined
  let checked = 0
  let skipped = 0
  let reason: string | undefined
  let cutShort = false
  /** Scores every loadout one search sends, one at a time. */
  const search = async (picks: RosterPick[], walk?: { seed: number; steps: number }) => {
    let top: OptimizedLoadout | undefined
    let local = false
    let done = false
    try {
      const request = { catalogueId: resolved.catalogueId, detachmentIds: resolved.detachmentIds, picks, pickIndex: 0, walk }
      for await (const batch of combatLoadoutCandidates(loaded, request, signal, rules)) {
        local = batch.local
        done = batch.done
        for (const candidate of batch.candidates) {
          if (signal.aborted) break
          const read = { members: candidate.members.map((member) => ({ ...member, rules: readRules(member.rules, words) })) }
          const found = await score({ candidates: [read] }, scoring, input.mode)
          checked++
          if (found.skipped) {
            skipped += found.skipped
            reason ??= found.reason
          }
          if (checked === 1) current = found.best
          if (found.best && (!top || compareOutcomes(found.best.result, top.result) > 0)) top = found.best
          if (found.best && (!best || compareOutcomes(found.best.result, best.result) > 0)) best = found.best
        }
      }
    } catch (error) {
      if (!(error instanceof Error)) throw error
      if (!error.message.startsWith('The full search could not finish')) throw new CombatRefusal([error.message])
      cutShort = true
    }
    if (!done) cutShort = true
    return { top, local }
  }
  /** Moves to the best loadout near the start until none near it is better, and says whether the search was local. */
  const climb = async (walk?: { seed: number; steps: number }) => {
    let found = await search(resolved.picks, walk)
    let here: OptimizedLoadout | undefined
    while (found.local && !signal.aborted && found.top && (!here || compareOutcomes(found.top.result, here.result) > 0)) {
      here = found.top
      found = await search(applyOptimizedLoadout(resolved.picks, here.picks))
    }
    return found.local
  }
  const notes: string[] = []
  let exhaustive = false
  try {
    if (await climb()) {
      for (
        let seed = 1, stale = 0;
        seed <= RESTARTS && stale < STALE_RESTARTS && !signal.aborted && performance.now() - started < LOCAL_SEARCH_MS;
        seed++
      ) {
        const before = best
        await climb({ seed, steps: WALK_STEPS })
        stale = best === before ? stale + 1 : 0
      }
      notes.push(
        'The unit allows too many loadouts to check them all, so this is the best found by improving on several starting loadouts; a better one may exist.',
      )
    } else if (cutShort) notes.push('The search could not finish in time, so a better loadout may exist.')
    // A loadout skipped for its rules or this server's work limit was never scored, so the best of the rest is not proven best.
    else exhaustive = skipped === 0
  } catch (error) {
    if (error instanceof CombatRefusal) return refused(error.reasons, error.type)
    throw error
  } finally {
    optimizations--
    score.close()
  }
  if (!best) return refused([reason ?? 'No supported legal loadout is available.'], 'refused')
  if (skipped) notes.push(`${skipped} loadouts were left out because the simulator cannot estimate them${reason ? `: ${reason}` : '.'}`)
  const price = (loadout: OptimizedLoadout) =>
    sidePrice(loaded, rules, resolved.catalogueId, resolved.detachmentIds, applyOptimizedLoadout(resolved.picks, loadout.picks))
  const described = (loadout: OptimizedLoadout) => {
    const priced = price(loadout)
    return {
      units: loadout.picks.map(({ pickIndex, pick }) => ({
        name: loaded.index.definitions.get(pick.entryId)?.name ?? pick.entryId,
        role: pickIndex === 0 ? 'unit' : 'attached',
        ...(pick.choices && Object.keys(pick.choices).length ? { choices: pick.choices } : {}),
        ...(pick.spreads && Object.keys(pick.spreads).length ? { spreads: pick.spreads } : {}),
        wargear:
          priced?.units.find((unit) => unit.key === pickIndex)?.wargear.map(({ name: piece, count }) => ({ name: piece, count })) ?? [],
      })),
      weaponModes: loadout.preferences,
      outcome: outcome(loadout.result),
    }
  }
  return structured({
    mode: input.mode,
    exhaustive,
    loadoutsChecked: checked,
    best: { ...described(best), better: !current || compareOutcomes(best.result, current.result) > 0 },
    ...(current ? { current: described(current) } : {}),
    ...(notes.length ? { notes } : {}),
  })
}

function sharedSide({ resolved }: Combatant, rules: SideInput['rules']) {
  const [pick, ...attached] = resolved.picks.slice(0, resolved.members)
  const { attachedTo: _host, ...host } = pick!
  return {
    catalogueId: resolved.catalogueId,
    pick: host,
    rules: rules ?? {},
    ...(resolved.detachmentIds.length ? { detachmentIds: resolved.detachmentIds } : {}),
    ...(attached.length
      ? { attached: attached.map(({ attachedTo, ...member }) => (attachedTo ? { ...member, attachedTo } : member)) }
      : {}),
  }
}

export function registerCombatTools(tools: AgentTools) {
  tools.registerTool(
    'simulate_combat',
    {
      title: 'Estimate combat between two units',
      description:
        "Runs Praetorium's exact combat simulator for one attacking unit, with any attached leaders, against one defending unit: shooting, melee, and shooting followed by melee. Returns expected models destroyed, expected wounds lost, the chance to destroy the unit, cumulative odds, weapons used, the wargear each unit fielded, the rule and weapon-mode choices each side can change, datasheet citations, and a simulator link. Each unit takes its default loadout unless given choices and spreads; to field a unit from get_my_roster, pass its pick's entryId as unit with the pick's models, choices and spreads, its attached picks under attached, and the roster's detachment. Units start at full strength unless modelsLost or woundsLost say otherwise. Passive datasheet rules apply by default; stratagems and conditional rules, including below-strength ones, stay off until chosen in rules. A modifier never chooses a rule: charged and heavy change only weapon abilities such as [LANCE] and [HEAVY], so a rule whose option needs the unit to have charged or remained stationary must also be chosen. Rules the simulator cannot calculate are never approximated: a phase it cannot estimate has status refused with its reasons, and recognised rules it leaves out are listed under notCalculated, so explain those gaps rather than retrying. Errors are reserved for unknown factions or units, illegal unit sizes, wargear, attachments, enhancements, or losses, and unavailable reference data. A weapon choice left out of weaponModes takes the option that does most against this defender. A side fields a detachment's rules and offers its stratagems only when its detachment is named, an enhancement applies only when named for its unit or among its choices, and another unit's aura applies only when that unit is listed in nearby and its rule chosen. The simulator link keeps loadouts but opens every unit at full strength.",
      inputSchema: simulateCombatInputSchema,
      annotations: READ_ONLY_TOOL,
    },
    simulateCombat,
  )
  tools.registerTool(
    'optimize_loadout',
    {
      title: 'Find the best loadout against a unit',
      description:
        "Searches the attacking unit's legal wargear, with any attached leaders, for the loadout most likely to destroy the defender, then the most models destroyed, then the most wounds, as the simulator's Optimize does. Takes the same sides as simulate_combat; the attacker's choices and spreads are where the search starts, and model counts, enhancements and detachment upgrades stay fixed. mode ranks shooting followed by melee (combined), or one phase. Returns best and current, each with every attacking unit's choices and spreads ready for a roster pick or simulate_combat (a group left out keeps its default), its wargear by name, the weapon modes it used, and its odds; better says whether best beats current. exhaustive is true only when every legal loadout was checked; otherwise notes say why a better one may exist. Loadouts with rules the simulator cannot estimate are left out and named in notes. Takes up to about 20 seconds.",
      inputSchema: optimizeLoadoutInputSchema,
      annotations: READ_ONLY_TOOL,
    },
    optimizeCombatLoadout,
  )
}
