import { z } from 'zod'
import { saveRosterSchema } from '../contracts/schemas'
import type { RosterPick, VsPick } from '../core/roster'
import { isUnitCompositionChoice, VS_ALLEGIANCE, VS_ENHANCEMENT, VS_MODELS, VS_UPGRADE } from '../core/unitChoices'
import { vsResized } from '../core/vsDataUnit'
import { vsDefinitionsOf, vsUnitIdOf } from '../shared/vsDataBuild'
import { vsFirstPickOf } from '../shared/vsDataPicks'
import { rosterProblems } from '../core/rosterLegality'
import { freeWargear } from '../shared/combatLoadouts'
import { calculateRosterPrice, savedRosterPriceInput } from '../shared/pricing'
import { pricedDispositionNames, readableRoster } from '../shared/rosterFiles'
import { READ_ONLY_TOOL, structured, toolError, type AgentTools } from './agentTools'
import { app } from './app'
import { agentPoolWork } from './agentPoolWork'
import { calculateRosterGrades } from './rosterGrades'
import { CombatRefusal, detachmentId, namedUnit } from './combatTools'
import { activeReferenceCorpus } from './referenceApi'

// Grading runs dozens of exact simulations on the workers simulate_combat shares, so one request may not hold them for long.
const GRADE_TIMEOUT_MS = 60_000

type SummarisedRoster = Parameters<typeof savedRosterPriceInput>[0] & { name: string; pointsBudget?: number | null }

/** A list as the readable export names it, so an agent never has to resolve catalogue ids itself; null while its army data is unavailable. */
export async function rosterSummary(roster: SummarisedRoster) {
  const instance = app()
  const [loaded, rules] = await Promise.all([instance.catalogueFor(roster.catalogueId), instance.rulesFor(roster.catalogueId)])
  if (!loaded) return null
  const input = savedRosterPriceInput(roster)
  const priced = calculateRosterPrice(input, loaded, rules)
  if (!priced) return null
  const missing = roster.picks.length - priced.units.length
  return {
    ...readableRoster(
      { ...input, name: roster.name, pointsBudget: roster.pointsBudget },
      loaded,
      { ...priced, disposition: priced.disposition ?? null },
      pricedDispositionNames(priced, rules),
    ),
    problems: [
      ...rosterProblems(priced, roster).map((problem) => problem.message),
      ...(missing > 0 ? [`${missing} ${missing === 1 ? 'unit is' : 'units are'} missing from the current army data`] : []),
    ],
    // What the builder warns under "Could not check every rule": not proven illegal, so not a problem.
    unchecked: priced.unhandled,
    freeWargearLeftOut: priced.units.flatMap((unit) =>
      freeWargear(unit.choices)
        .filter((option) => !option.count)
        .map((option) => ({ unit: unit.name, entry: unit.key + 1, wargear: option.name })),
    ),
  }
}

/** A saved roster as save_roster takes it back: an automatically named one sends no name, so saving it keeps the generated title. */
export const reusableRoster = <T extends { name: string; automaticName: boolean }>(roster: T) =>
  roster.automaticName ? { ...roster, name: '' } : roster

const rosterInput = {
  roster: saveRosterSchema.describe(
    'A complete roster in the shape save_roster takes, such as the roster get_my_roster returns or a draft built from list_units and get_unit_options ids.',
  ),
}

const unavailable = () => toolError('unavailable', 'Praetorium army data is temporarily unavailable.')

const MAX_OPTION_UNITS = 12
const unitOptionsInput = {
  faction: z.string().trim().min(1).max(160).describe('Faction id, URL slug, or display name from list_reference or list_units.'),
  units: z
    .array(
      z.object({
        unit: z.string().trim().min(1).max(400).describe('Unit id, slug, or name from list_units.'),
        models: z.int().min(1).max(60).optional().describe('Unit size; per-model limits depend on it. Defaults to the minimum size.'),
      }),
    )
    .min(1)
    .max(MAX_OPTION_UNITS)
    .describe('The units to read options for, priced together as one list in this battle size and detachment.'),
  battleSize: z.int().min(1).max(10_000).default(2_000).describe('The roster limit in points.'),
  detachment: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .optional()
    .describe('Detachment id, slug, or name from list_units; enhancements and detachment upgrades are offered only under one.'),
}

type PricedUnit = NonNullable<ReturnType<typeof calculateRosterPrice>>['units'][number]

/** Where a VS pick saves each of its choices, by the choice's key. */
const vsField = (key: string) =>
  key === VS_MODELS
    ? 'vs.models'
    : key === VS_ENHANCEMENT || key === VS_UPGRADE
      ? 'vs.enhancement'
      : key === VS_ALLEGIANCE
        ? 'vs.allegiance'
        : 'vs.options'

/** A priced unit's decisions as a pick sets them: names first, the ids a pick takes beside them, and nothing a rules text says. */
function unitOptions(unit: PricedUnit, vs?: VsPick) {
  if (vs)
    return {
      name: unit.name,
      entryId: unit.entryId,
      points: unit.points,
      models: {
        count: unit.size.models,
        min: unit.size.min,
        max: unit.size.max,
        ...(unit.size.options ? { sizes: unit.size.options } : {}),
      },
      vs,
      toggles: unit.toggles.map((toggle) => ({
        name: toggle.name,
        key: toggle.key,
        set: 'vs.warlord',
        ...(toggle.required ? { required: true } : {}),
      })),
      choices: unit.choices.map((choice) => ({
        name: choice.name,
        key: choice.key,
        set: vsField(choice.key),
        optional: choice.optional,
        room: choice.room,
        ...(choice.least ? { least: choice.least } : {}),
        ...(choice.uniform ? { uniform: true } : {}),
        options: choice.options.map((option) => ({
          name: option.name,
          id: option.id,
          ...(option.points ? { points: option.points } : {}),
          taken: option.count,
          min: option.min,
          max: option.max,
        })),
      })),
    }
  return {
    name: unit.name,
    entryId: unit.entryId,
    points: unit.points,
    models: { count: unit.size.models, min: unit.size.min, max: unit.size.max, ...(unit.size.options ? { sizes: unit.size.options } : {}) },
    toggles: unit.toggles.map((toggle) => ({ name: toggle.name, key: toggle.key, ...(toggle.required ? { required: true } : {}) })),
    choices: unit.choices.map((choice) => {
      const kind = 'kind' in choice && choice.kind ? choice.kind : isUnitCompositionChoice(choice) ? 'composition' : 'wargear'
      return {
        name: choice.name,
        key: choice.key,
        kind,
        set: choice.room > 1 ? (choice.uniform ? 'spreads, every model one option' : 'spreads') : 'choices',
        ...(choice.owner ? { model: choice.owner.name } : {}),
        optional: choice.optional,
        room: choice.room,
        ...(choice.least ? { least: choice.least } : {}),
        options: choice.options.map((option) => ({
          name: option.name,
          id: option.id,
          ...(option.points ? { points: option.points } : {}),
          taken: option.count,
          min: option.min,
          max: option.max,
        })),
      }
    }),
  }
}

/** The named units priced together as one list, so detachment costs and army-wide limits shape their options. */
export async function unitOptionsFor({ faction, units, battleSize, detachment }: z.output<z.ZodObject<typeof unitOptionsInput>>) {
  const corpus = await activeReferenceCorpus()
  if (!corpus) return unavailable()
  try {
    const named = await Promise.all(units.map((wanted) => namedUnit(corpus, faction, wanted.unit)))
    const { faction: found, loaded, rules } = named[0]!
    const detachmentIds = detachment ? [detachmentId(loaded, found.id, detachment)] : []
    const list = { catalogueId: found.id, detachmentIds }
    const definitions = vsDefinitionsOf(loaded)
    const picks = named.map((entry, index): RosterPick => {
      const models = units[index]!.models
      const first = vsFirstPickOf(loaded, list, entry.unit.id)
      const unit = vsUnitIdOf(loaded, entry.unit.id)
      if (!first || !definitions || !unit) return { entryId: entry.unit.id, ...(models ? { models } : {}) }
      if (!models) return { entryId: entry.unit.id, vs: first }
      const sized = vsResized(definitions, { unit, models: first.models, options: first.options }, models)
      return { entryId: entry.unit.id, vs: { ...first, models: sized.models ?? first.models, options: sized.options ?? {} } }
    })
    const priced = calculateRosterPrice(
      savedRosterPriceInput({ catalogueId: found.id, detachmentIds, disposition: null, limit: battleSize, picks }),
      loaded,
      rules,
    )
    if (!priced) return unavailable()
    return structured({
      roster: {
        catalogueId: found.id,
        detachmentIds,
        limit: battleSize,
        dispositions: priced.dispositions.map((id) => ({ name: rules?.dispositions.get(id) ?? id, id })),
      },
      units: picks.map((pick, index) => {
        const unit = priced.units.find((candidate) => candidate.key === index)
        return unit ? unitOptions(unit, pick.vs) : { name: named[index]!.unit.name, entryId: pick.entryId, unavailable: true }
      }),
    })
  } catch (error) {
    if (error instanceof CombatRefusal) return toolError(error.type, error.reasons.join(' '))
    throw error
  }
}

export function registerRosterTools(server: AgentTools) {
  server.registerTool(
    'check_roster',
    {
      title: 'Check a roster',
      description:
        'Prices a roster and lists every problem that stops it being fielded, without saving it or needing an account: the same summary get_my_roster gives a saved list. summary names each unit with its points, models, wargear, enhancements, Warlord and attachments, and gives the total; problems is empty when the list is legal. unchecked names restrictions Praetorium could not evaluate, which the player must check in the source rules before playing. freeWargearLeftOut names optional wargear that costs no points and replaces nothing but is not taken; take it with get_unit_options unless the player left it out on purpose.',
      inputSchema: rosterInput,
      annotations: READ_ONLY_TOOL,
    },
    async ({ roster }) => {
      const summary = await rosterSummary(roster)
      return summary ? structured({ summary }, { problems: summary.problems.length }) : unavailable()
    },
  )
  server.registerTool(
    'grade_roster',
    {
      title: 'Grade a roster',
      description:
        "Grades which jobs a roster can do on the table, as the roster builder's grades do: score 0 to 100 and grade A to D overall and per category (board control, mobility, damage against reference targets, durability), placed among tournament lists of the same battle size and centred on comparedWith's armies, so a list's distance from its army's typical list reads on every army's spread. A typical tournament list scores about 70. It measures coverage, not strength: in tournament games the players' skill decided far more than any list measure, the overall grade went with winning only slightly, and more units with an even spread of points went with winning most. So never call a list competitive from its grade, and never present it as a win rate. missing names the reference targets nothing in the list can take half of alone. units gives each unit the jobs it is credited with; a leader or support character counts inside the unit it joins, so its buffs never show as its own job, and cutting it for another unit always raises board presence. A unit with one joined to it lists it under attached, with each target whose share of wounds the unit takes changes without it: with and without, where 1 is one whole target. Weigh that before cutting it. tournament, when the army has enough top-four lists, gives stapleShare (the share of its points in datasheets at least 3 in 10 of those lists field, which went with winning slightly), the staples it leaves out and its unproven datasheets that no winning list fields. calibration.lists is 'drawn' when the battle size was compared with lists drawn from 2,000-point tournament lists rather than real lists of its size, a rougher comparison, and there nothing shows that more units or an even spread go with winning. It measures units at full strength with passive rules only, from the exact simulator, so it rarely tells detachments apart; compare detachments with simulate_combat. Each row's notCalculated names units or rules it could not measure. Takes a few seconds; check the list with check_roster first, since a list that cannot be fielded still grades.",
      inputSchema: rosterInput,
      annotations: READ_ONLY_TOOL,
    },
    async ({ roster }) => {
      if (!(await app().catalogueFor(roster.catalogueId))) return unavailable()
      try {
        const grades = await agentPoolWork(() =>
          calculateRosterGrades(savedRosterPriceInput(roster), AbortSignal.timeout(GRADE_TIMEOUT_MS), { attachedShares: true }),
        )
        return grades
          ? structured({ grades }, { missing: grades.missing.length, ...(grades.score === null ? {} : { score: grades.score }) })
          : toolError('unavailable', 'The simulator is busy grading other lists just now. Try again shortly.')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError')
          return toolError('unavailable', 'Grading took too long just now. Try again shortly.')
        if (error instanceof Error && error.message.startsWith('The calculation service'))
          return toolError('unavailable', 'The simulator is busy just now. Try again shortly.')
        throw error
      }
    },
  )
  server.registerTool(
    'get_unit_options',
    {
      title: 'Read unit options for a roster',
      description:
        "Lists what each named unit lets a roster pick set, with names first and the ids a pick takes beside them: its sizes, its toggles (key of the Warlord toggle: set toggles {key: 1} on exactly one CHARACTER), and every choice group (wargear, enhancement, detachment upgrade, unit composition) with its options' ids, points, how many the default loadout takes (taken), and per-option min and max. A choice whose set is choices takes {key: optionId}; omit an optional one to decline it. One whose set is spreads takes {key: {optionId: count}}, counts within each option's min and max, totalling no more than room and at least least; for 'every model one option' give the whole room to one option. A group whose key extends another's key and option id applies only while that option is taken. Enhancements and detachment upgrades appear only with a detachment, at their cost; a list takes each enhancement once, on a CHARACTER that is not an Epic Hero, and a unit holds at most one, counting the leaders and support units attached to it, which these options can't see; check_roster flags a second. roster gives the catalogueId, detachmentIds and dispositions a save_roster or check_roster roster takes. Leave out a choice to keep the default; check the finished list with check_roster. A unit returned with vs is fielded by VS Data IDs: save its pick as {entryId, vs} with vs as returned and no models, choices, spreads or toggles, and change vs instead. Each choice's set names where: vs.options takes {choice key: {option id: count}}, counts within each option's max and totalling no more than room; uniform gives the whole room to one option; vs.models takes {option id: count} totalling room; vs.enhancement takes one option id from the enhancement or upgrade choice, since a unit holds one; vs.allegiance takes one option id; vs.warlord takes the Warlord toggle's key on exactly one unit.",
      inputSchema: unitOptionsInput,
      annotations: READ_ONLY_TOOL,
    },
    unitOptionsFor,
  )
}
