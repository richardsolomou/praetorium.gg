import { z } from 'zod'
import type { CombatResult } from '../core/combat'
import { combatAdjustmentsSchema } from '../core/combatAdjustments'
import { combatMatchup, resolveCombatRequest, type CombatantSnapshot, type CombatRequest } from '../core/combatMatchup'
import {
  combatEffectAppliesTo,
  combatRuleAppliesTo,
  combatRuleChoices,
  combatRuleKey,
  combatRuleRoles,
  combatRuleSelections,
  type CombatRule,
} from '../core/combatRules'
import { combatUnitKeywords } from '../core/combatUnit'
import type { RosterPick } from '../core/roster'
import { encodeSimulatorState } from '../contracts/simulatorState'
import type { AgentTools } from './agentTools'
import { app } from './app'
import { activeReferenceCorpus } from './referenceApi'
import type { ReferenceCorpus } from './referenceCorpus'
import { datasheetCitation, referenceFaction } from './referenceService'
import { rosterCombatant } from './rosterCombatRules'

/**
 * Estimates run synchronously on the shared server, so this is 400 times below the browser worker's bound, about
 * 150 ms of calculation; full-size infantry matchups need a tenth of it.
 */
export const COMBAT_TOOL_MAX_WORK = 5_000_000
const MAX_ATTACHED = 2

type Phase = 'ranged' | 'melee'
type Role = 'attacker' | 'defender'

const name = z.string().trim().min(1).max(400)
const ruleChoicesSchema = z
  .record(z.string().max(400), z.int().min(0).max(20))
  .refine((choices) => Object.keys(choices).length <= 60, 'Choose at most 60 rules.')
const memberShape = {
  unit: name.describe('Unit id, slug, name, or referenceId from list_units.'),
  models: z.int().min(1).max(60).optional().describe('Model count; must be a legal unit size. Defaults to the minimum size.'),
}
const sideSchema = z.object({
  faction: z.string().trim().min(1).max(160).describe('Faction id, URL slug, or display name from list_reference or list_units.'),
  ...memberShape,
  attached: z
    .array(
      z.object({
        ...memberShape,
        faction: z.string().trim().min(1).max(160).optional().describe("Defaults to the unit's faction."),
      }),
    )
    .max(MAX_ATTACHED)
    .optional()
    .describe('Leaders or support units joined to the unit, from its canBeLedBy and canBeSupportedBy.'),
  rules: ruleChoicesSchema
    .optional()
    .describe('Rule choices by rule id from a previous result: 0 turns a rule off and n selects its nth option.'),
})
export const simulateCombatInputSchema = z.object({
  attacker: sideSchema,
  defender: sideSchema,
  modifiers: combatAdjustmentsSchema
    .optional()
    .describe(
      'Situational modifiers the simulator page offers, such as { "all": { "cover": true, "hitModifier": -1 } }, { "melee": { "charged": true } }, or { "target": { "invulnerable": 4 } }.',
    ),
  weaponModes: z
    .record(z.string().max(400), z.string().max(200))
    .refine((modes) => Object.keys(modes).length <= 60, 'Choose at most 60 weapon modes.')
    .optional()
    .describe('Weapon mode choices by key from a previous result, such as a frag or krak profile.'),
})
type SimulateCombatInput = z.infer<typeof simulateCombatInputSchema>
type SideInput = z.infer<typeof sideSchema>

/** Why a matchup has no estimate; each reason names the input or mechanic that is not supported. */
class CombatRefusal extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons.join(' '))
  }
}

function refused(reasons: readonly string[]) {
  const unique = [...new Set(reasons)]
  return {
    content: [{ type: 'text' as const, text: `The simulator cannot estimate this matchup: ${unique.join(' ')}` }],
    structuredContent: { refused: unique },
    isError: true as const,
  }
}

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
    expectedWoundsLost: round(result.meanDamage),
    destroyedChance: round(result.wipe),
    atLeastModelsDestroyedChance: atLeast,
  }
}

/** The picks a side names, refusing a faction or unit the simulator does not offer. */
async function sidePicks(corpus: ReferenceCorpus, side: SideInput) {
  const shelves = await app().combatUnitsFor()
  const canonical = new Map(corpus.catalogue.datasheets.map((sheet) => [`${sheet.catalogueId}:${sheet.id}`, sheet]))
  const resolve = (factionName: string, unitName: string) => {
    const faction = referenceFaction(corpus, factionName)
    const shelf = faction && shelves.find((candidate) => candidate.catalogueId === faction.id)
    if (!faction || !shelf) throw new CombatRefusal([`Faction not found: ${factionName}.`])
    const wanted = unitName.toLocaleLowerCase()
    const unit = shelf.units.find((candidate) => {
      const sheet = canonical.get(`${faction.id}:${candidate.id}`)
      return [candidate.id, candidate.name, sheet?.slug, datasheetCitation(sheet).referenceId].some(
        (value) => value?.toLocaleLowerCase() === wanted,
      )
    })
    if (!unit) throw new CombatRefusal([`${faction.name} has no simulated unit named ${unitName}.`])
    return { faction, unit, sheet: canonical.get(`${faction.id}:${unit.id}`) }
  }
  const host = resolve(side.faction, side.unit)
  const found = (side.attached ?? []).map((member) => resolve(member.faction ?? side.faction, member.unit))
  const picks: RosterPick[] = [
    { entryId: host.unit.id, catalogueId: host.faction.id, ...(side.models ? { models: side.models } : {}) },
    ...found.map((member, index) => ({
      entryId: member.unit.id,
      catalogueId: member.faction.id,
      attachedTo: 0,
      ...(side.attached?.[index]?.models ? { models: side.attached[index].models } : {}),
    })),
  ]
  return { catalogueId: host.faction.id, picks, sheets: [host.sheet, ...found.map((member) => member.sheet)] }
}

/** One side at full strength, with the rules it brings and the choices an agent can make about them. */
async function combatant(corpus: ReferenceCorpus, side: SideInput, role: Role) {
  const resolved = await sidePicks(corpus, side)
  const instance = app()
  const [loaded, rules] = await Promise.all([instance.catalogueFor(resolved.catalogueId), instance.rulesFor(resolved.catalogueId)])
  if (!loaded) throw new CombatRefusal(['Praetorium reference data is temporarily unavailable.'])
  const projection = rosterCombatant(loaded, rules, {
    catalogueId: resolved.catalogueId,
    detachmentIds: [],
    picks: resolved.picks,
    pickIndex: 0,
  })
  if (!projection) throw new CombatRefusal([`${side.unit} could not be loaded.`])
  const errors = [
    ...projection.attachmentErrors.map((error) => `${error.entryName}: ${error.message}.`),
    ...[
      { requested: side.models, built: projection.models, name: projection.selected.name },
      ...projection.companions.map((member, index) => ({
        requested: side.attached?.[index]?.models,
        built: member.models,
        name: member.selected.name,
      })),
    ].flatMap(({ requested, built, name: unit }) =>
      requested !== undefined && requested !== built ? [`${unit} cannot field ${requested} models.`] : [],
    ),
  ]
  if (errors.length) throw new CombatRefusal(errors)
  const selection = combatRuleSelections(
    [...projection.rules, ...projection.companions.flatMap((member) => member.rules)],
    side.rules ?? {},
  )
  const snapshot: CombatantSnapshot = {
    sheet: projection.selected,
    bodyguard: true,
    models: projection.models,
    startingModels: projection.models,
    damage: 0,
    carriers: projection.carriers,
    rules: selection.active(projection.rules),
    ruleChoices: selection.choices,
    sharedDefenceSources: selection.sharedDefenceSources(projection.rules),
    companions: projection.companions.map((member) => ({
      sheet: member.selected,
      bodyguard: false,
      models: member.models,
      startingModels: member.models,
      damage: 0,
      carriers: member.carriers,
      rules: selection.active(member.rules),
      sharedDefenceSources: selection.sharedDefenceSources(member.rules),
    })),
  }
  const units = resolved.sheets.map((sheet, index) => ({
    name: index ? projection.companions[index - 1]!.selected.name : projection.selected.name,
    models: index ? projection.companions[index - 1]!.models : projection.models,
    ...datasheetCitation(sheet),
  }))
  return { snapshot, units, rules: selection.rules, choices: selection.choices, resolved, role }
}

type Combatant = Awaited<ReturnType<typeof combatant>>

/** The rules a side can change and the recognised rules the calculation cannot apply. */
function ruleSummary(side: Combatant, opponent: Combatant) {
  const keywords = combatUnitKeywords(opponent.snapshot)
  const options = (rule: CombatRule) =>
    combatRuleChoices(rule)
      .map((choice, index) => ({ choice: index + 1, label: choice.label, effects: choice.effects }))
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
          combatRuleRoles(rule.description).includes(side.role),
      )
      .map((rule) => ({ id: rule.id, name: rule.name, source: rule.source, scope: rule.scope })),
  }
}

export async function simulateCombat(input: SimulateCombatInput) {
  const corpus = await activeReferenceCorpus()
  if (!corpus) return refused(['Praetorium reference data is temporarily unavailable.'])
  const sides = await Promise.allSettled([combatant(corpus, input.attacker, 'attacker'), combatant(corpus, input.defender, 'defender')])
  const reasons = sides.flatMap((side) => {
    if (side.status === 'fulfilled') return []
    if (side.reason instanceof CombatRefusal) return side.reason.reasons
    throw side.reason
  })
  if (reasons.length) return refused(reasons)
  const [attacker, defender] = sides.map((side) => (side as PromiseFulfilledResult<Combatant>).value) as [Combatant, Combatant]
  const matchup = combatMatchup(attacker.snapshot, defender.snapshot, {
    preferences: input.weaponModes ?? {},
    excluded: { ranged: [], melee: [] },
    allocation: [],
  })
  if (matchup.target?.error) return refused([matchup.target.error])
  const adjustments = input.modifiers ?? {}
  const request: CombatRequest = {
    ranged: matchup.scenario('ranged', adjustments),
    melee: matchup.scenario('melee', adjustments),
    sequenceError: matchup.sequenceError,
  }
  const answer = resolveCombatRequest(request, COMBAT_TOOL_MAX_WORK)
  const phase = (key: Phase) => {
    const plan = matchup.plans[key]!
    const weapons = plan.active.map((entry) => ({ name: entry.profile.name, count: entry.count }))
    const modes = plan.choices.map((choice) => ({ key: choice.key, label: choice.label, value: choice.value, options: choice.options }))
    const result = answer[key]
    if (plan.errors.length) return { status: 'refused' as const, reasons: plan.errors, weapons, weaponModes: modes }
    if (!result) return { status: 'refused' as const, reasons: ['This phase could not be built.'], weapons, weaponModes: modes }
    if (result.error) return { status: 'refused' as const, reasons: [result.error], weapons, weaponModes: modes }
    if (!request[key]!.weapons.length && !request[key]!.mortalWounds?.length) return { status: 'no attacks' as const }
    return { status: 'estimated' as const, ...outcome(result.result!), weapons, weaponModes: modes }
  }
  const shooting = phase('ranged')
  const fight = phase('melee')
  if (shooting.status === 'refused' && fight.status === 'refused') return refused([...shooting.reasons, ...fight.reasons])
  const citations = [...attacker.units, ...defender.units]
  const documents = citations.flatMap((unit) => (unit.referenceId && corpus.byId.get(unit.referenceId)) || [])
  const result = {
    attacker: { units: attacker.units, ...ruleSummary(attacker, defender) },
    defender: {
      units: defender.units,
      models: matchup.target?.target?.groups.reduce((total, group) => total + group.models, 0) ?? 0,
      ...ruleSummary(defender, attacker),
    },
    shooting,
    melee: fight,
    shootingThenMelee: answer.combined?.result
      ? { status: 'estimated' as const, ...outcome(answer.combined.result) }
      : answer.combined?.error
        ? { status: 'refused' as const, reasons: [answer.combined.error] }
        : { status: 'not applicable' as const },
    simulatorUrl: `/simulator?s=${encodeSimulatorState({
      v: 1,
      sides: [sharedSide(attacker, input.attacker.rules), sharedSide(defender, input.defender.rules)],
      swapped: false,
      matchup: { adjustments, preferences: input.weaponModes ?? {}, excluded: { ranged: [], melee: [] }, allocation: [] },
    })}`,
    revisions: corpus.catalogue.revisions,
    attribution: [...new Set(documents.flatMap((document) => document.attribution))],
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result }
}

function sharedSide({ resolved }: Combatant, rules: SideInput['rules']) {
  const [pick, ...attached] = resolved.picks
  const { attachedTo: _host, ...host } = pick!
  return {
    catalogueId: resolved.catalogueId,
    pick: host,
    rules: rules ?? {},
    ...(attached.length ? { attached: attached.map(({ attachedTo: _attachedTo, ...member }) => member) } : {}),
  }
}

export function registerCombatTools(tools: AgentTools) {
  tools.registerTool(
    'simulate_combat',
    {
      title: 'Estimate combat between two units',
      description:
        "Runs Praetorium's exact combat simulator for one attacking unit, with any attached leaders, against one defending unit at full strength: shooting, melee, and shooting followed by melee. Returns expected models destroyed, expected wounds lost, the chance to destroy the unit, cumulative odds, weapons used, the rule and weapon-mode choices each side can change, datasheet citations, and a simulator link. Passive datasheet rules apply by default; stratagems and conditional rules stay off until chosen. Unsupported mechanics are refused or listed under notCalculated rather than approximated. Like the standalone simulator page, it uses default loadouts and no detachment; unit sizes and attachments must be legal.",
      inputSchema: simulateCombatInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    simulateCombat,
  )
}
