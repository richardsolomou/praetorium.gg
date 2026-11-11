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
  combatRuleChoices,
  combatRuleKey,
  combatRuleRoles,
  combatRuleSelections,
  type CombatRule,
} from '../core/combatRules'
import { admitsHost, attachmentOf } from '../core/attach'
import { combatUnitKeywords } from '../core/combatUnit'
import type { RosterPick } from '../core/roster'
import { encodeSimulatorState } from '../contracts/simulatorState'
import { joinKey } from '../core/text'
import { fuzzyNameScore } from '../core/datasheetSearch'
import { hasTextTokens } from '../shared/sourceText'
import type { ToolErrorType } from '../contracts/agentTools'
import { READ_ONLY_TOOL, structured, toolError, type AgentTools } from './agentTools'
import { app } from './app'
import { combatantSnapshot, withReadRules } from '../shared/rosterGradeMeasures'
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
}
const otherUnit = z.object({
  ...memberShape,
  faction: z.string().trim().min(1).max(160).optional().describe("Defaults to the unit's faction."),
})
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
    .array(otherUnit.omit({ models: true }))
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
class CombatRefusal extends Error {
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

/** The picks a side names, refusing a faction the simulator does not offer or a unit its lists cannot take. */
async function sidePicks(corpus: ReferenceCorpus, side: SideInput) {
  const instance = app()
  const [shelves, current] = await Promise.all([instance.combatUnitsFor(), currentFactionIds()])
  const resolve = async (factionName: string, unitName: string) => {
    const faction = referenceFaction(corpus, factionName)
    if (!faction) throw new CombatRefusal([`No faction is named ${factionName}; use a name or id from list_factions.`], 'not_found')
    if (!shelves.some((shelf) => shelf.catalogueId === faction.id))
      throw new CombatRefusal([`The simulator does not offer ${faction.name}.`], 'not_found')
    const [loaded, rules] = await Promise.all([instance.catalogueFor(faction.id), instance.rulesFor(faction.id)])
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
    return { faction, unit, sheet: sheets.get(unit.id) }
  }
  const host = await resolve(side.faction, side.unit)
  const attached = side.attached ?? []
  const others = [...attached, ...(side.nearby ?? [])]
  const found = await Promise.all(others.map((member) => resolve(member.faction ?? side.faction, member.unit)))
  const picks: RosterPick[] = [
    { entryId: host.unit.id, catalogueId: host.faction.id, ...(side.models ? { models: side.models } : {}) },
    ...found.map((member, index) => ({
      entryId: member.unit.id,
      catalogueId: member.faction.id,
      ...(index < attached.length ? { attachedTo: 0 } : {}),
      ...(attached[index]?.models ? { models: attached[index].models } : {}),
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
  const price = calculateRosterPrice({ catalogueId, detachmentIds, disposition: null, limit: 2_000, units: picks }, loaded, rules)
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
function detachmentId(loaded: LoadedCatalogue, catalogueId: string, detachment: string) {
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

/** One side at full strength, with the rules it brings and the choices an agent can make about them. */
async function combatant(corpus: ReferenceCorpus, side: SideInput, role: Role) {
  const named = await sidePicks(corpus, side)
  const instance = app()
  const [loaded, rules] = await Promise.all([instance.catalogueFor(named.catalogueId), instance.rulesFor(named.catalogueId)])
  if (!loaded) throw new CombatRefusal([REFERENCE_UNAVAILABLE], 'unavailable')
  const detachmentIds = side.detachment ? [detachmentId(loaded, named.catalogueId, side.detachment)] : []
  const joined = joinedPicks(loaded, named.catalogueId, detachmentIds, named.picks)
  const resolved = {
    ...named,
    detachmentIds,
    picks: withEnhancements(loaded, rules, named.catalogueId, detachmentIds, joined, named.enhancements),
  }
  const unread = rosterCombatant(loaded, rules, { catalogueId: resolved.catalogueId, detachmentIds, picks: resolved.picks, pickIndex: 0 })
  if (!unread) throw new CombatRefusal([`${side.unit} could not be loaded.`])
  const projection = withReadRules(unread, await serverWords())
  const errors = [
    ...projection.attachmentErrors.map((error) => `${error.entryName}: ${error.message}.`),
    ...[
      { requested: side.models, built: projection.models, name: projection.selected.name },
      ...projection.companions.map((member) => ({
        requested: side.attached?.[member.pickIndex - 1]?.models,
        built: member.models,
        name: member.selected.name,
      })),
    ].flatMap(({ requested, built, name: unit }) =>
      requested !== undefined && requested !== built ? [`${unit} cannot field ${requested} models; list_units gives its unit sizes.`] : [],
    ),
  ]
  if (errors.length) throw new CombatRefusal(errors)
  const selection = combatRuleSelections(
    [...projection.rules, ...projection.companions.flatMap((member) => member.rules)],
    side.rules ?? {},
  )
  const snapshot = combatantSnapshot(projection, selection)
  const units = resolved.sheets.slice(0, named.members).map((sheet, index) => {
    const member = index ? projection.companions.find((companion) => companion.pickIndex === index)! : null
    const enhancement = named.enhancements[index]
    return {
      name: member ? member.selected.name : projection.selected.name,
      models: member ? member.models : projection.models,
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

/** A named faction's unit at full strength with its passive rules, or null when the reference data cannot field it. */
export async function namedCombatant(faction: string, unit: string, models?: number): Promise<CombatantSnapshot | null> {
  const corpus = await activeReferenceCorpus()
  if (!corpus) return null
  try {
    return (await combatant(corpus, { faction, unit, ...(models ? { models } : {}) }, 'defender')).snapshot
  } catch (error) {
    if (error instanceof CombatRefusal) return null
    throw error
  }
}

const comparable = (text: string) =>
  text
    .replaceAll(/\*\*|\^\^|<\/?[a-z]+>/gi, '')
    .replaceAll(/[‘’]/g, "'")
    .replaceAll(/[“”]/g, '"')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** A choice's label with each part that repeats a clause of the rule's words replaced, since agents get no rules text. */
function unquoted(label: string, words: string) {
  const text = comparable(words)
  const quotes = (clause: string) => clause.split(' ').length >= 5 && text.includes(comparable(clause))
  return label
    .split(' · ')
    .map((part) => (part.split(/ or /i).some(quotes) ? 'Condition the rule states' : part))
    .join(' · ')
}

/** The rules a side can change and the recognised rules the calculation cannot apply. */
function ruleSummary(side: Combatant, opponent: Combatant) {
  const keywords = combatUnitKeywords(opponent.snapshot)
  const options = (rule: CombatRule) =>
    combatRuleChoices(rule)
      .map((choice, index) => ({ choice: index + 1, label: unquoted(choice.label, rule.description), effects: choice.effects }))
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
          (combatRuleRoles(rule.description).includes(side.role) ||
            // The snapshot does not hold this card's words, so what the rule does is unknown; a stratagem stays off anyway.
            (rule.scope !== 'stratagem' && hasTextTokens(rule.description))),
      )
      .map((rule) => ({ id: rule.id, name: rule.name, source: rule.source, scope: rule.scope })),
  }
}

export async function simulateCombat(input: SimulateCombatInput) {
  const corpus = await activeReferenceCorpus()
  if (!corpus) return refused([REFERENCE_UNAVAILABLE], 'unavailable')
  const sides = await Promise.allSettled([combatant(corpus, input.attacker, 'attacker'), combatant(corpus, input.defender, 'defender')])
  const refusals = sides.flatMap((side) => {
    if (side.status === 'fulfilled') return []
    if (side.reason instanceof CombatRefusal) return [side.reason]
    throw side.reason
  })
  if (refusals.length)
    return refused(
      refusals.flatMap((refusal) => refusal.reasons),
      refusals[0]!.type,
    )
  const [attacker, defender] = sides.map((side) => (side as PromiseFulfilledResult<Combatant>).value) as [Combatant, Combatant]
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
        "Runs Praetorium's exact combat simulator for one attacking unit, with any attached leaders, against one defending unit at full strength: shooting, melee, and shooting followed by melee. Returns expected models destroyed, expected wounds lost, the chance to destroy the unit, cumulative odds, weapons used, the rule and weapon-mode choices each side can change, datasheet citations, and a simulator link. Passive datasheet rules apply by default; stratagems and conditional rules stay off until chosen in rules. A modifier never chooses a rule: charged and heavy change only weapon abilities such as [LANCE] and [HEAVY], so a rule whose option needs the unit to have charged or remained stationary must also be chosen. Rules the simulator cannot calculate are never approximated: a phase it cannot estimate has status refused with its reasons, and recognised rules it leaves out are listed under notCalculated, so explain those gaps rather than retrying. Errors are reserved for unknown factions or units, illegal unit sizes, attachments, or enhancements, and unavailable reference data. It uses default loadouts; a weapon choice left out of weaponModes takes the option that does most against this defender. A side fields a detachment's rules and offers its stratagems only when its detachment is named, an enhancement applies only when named for its unit, and another unit's aura applies only when that unit is listed in nearby and its rule chosen.",
      inputSchema: simulateCombatInputSchema,
      annotations: READ_ONLY_TOOL,
    },
    simulateCombat,
  )
}
