import { sidePlayers } from './battlePrimitives'
import type { BattleSettings } from './battle'
import { battleCapacity } from './battleSeats'

/** How many detachments one roster may hold whatever its size says, and so how many names a pooled card may name. */
export const DETACHMENTS_MAX = 3
export const ROSTER_NAME_MAX_LENGTH = 80

const KOTC_LIMITS = [600] as const
/**
 * Sizes King of the Colosseum was offered at before and is no longer built at.
 *
 * A size that stops being offered does not stop being played: rosters saved at it and
 * battles already running on it keep their construction rules, their datasheet caps and
 * their tactical-only secondaries, because dropping them would quietly rewrite a list
 * its owner cannot rebuild.
 */
const RETIRED_KOTC_LIMITS = [500] as const
export const DEFAULT_GAME_LIMIT = 2000

/** The matched-play game sizes, smallest first; saved rosters and battle commands store these limits, so mission-pack size records never replace them. */
export const GAME_SIZES = [
  ...KOTC_LIMITS.map((limit) => ({ name: 'King of the Colosseum', limit })),
  { name: 'Incursion', limit: 1000 },
  { name: 'Strike Force', limit: 2000 },
  { name: 'Onslaught', limit: 3000 },
] as const

export const isGameSize = (limit: number | null) => GAME_SIZES.some((size) => size.limit === limit)

/** What a battle size allows, as a rules version's VS Data `battle-size` record states it. */
export type BattleSize = { points: number; detachmentPoints?: number; enhancements?: number }

/** What a size allows where the list's rules version has no record of it, or the caller has none to read. */
const UNRECORDED_SIZES: readonly BattleSize[] = [
  { points: 1000, detachmentPoints: 2 },
  { points: 2000, detachmentPoints: 3 },
  { points: 3000, detachmentPoints: 3 },
]

/** The battle size a list of `limit` points is played at: its rules version's record, else the unrecorded allowances. */
export const battleSizeOf = (limit: number, sizes: readonly BattleSize[] = []): BattleSize | undefined =>
  sizes.find((size) => size.points === limit) ?? UNRECORDED_SIZES.find((size) => size.points === limit)

export const detachmentPointBudget = (limit: number, sizes?: readonly BattleSize[]) => battleSizeOf(limit, sizes)?.detachmentPoints ?? null
export const isKotcLimit = (limit: number | null): boolean =>
  limit !== null && [...KOTC_LIMITS, ...RETIRED_KOTC_LIMITS].some((candidate) => candidate === limit)

/**
 * Bounds of a points budget agreed in place of a battle size's points total.
 *
 * The game system data offers this override inside its battle size with a 500-point
 * minimum and no maximum; the maximum is the saved roster contract's own bound.
 */
export const POINTS_BUDGET_MIN = 500
export const POINTS_BUDGET_MAX = 10_000

/** Points for one army in a team battle: any whole number up to the roster contract's bound. */
export const validArmyPoints = (points: number) => Number.isInteger(points) && points >= 1 && points <= POINTS_BUDGET_MAX
export const ARMY_POINTS_ERROR = `choose between 1 and ${POINTS_BUDGET_MAX.toLocaleString('en')} points per army`

/** King of the Colosseum fixes its points total, so only the core battle sizes take a custom budget. */
export const allowsPointsBudget = (limit: number | null): boolean => limit !== null && !isKotcLimit(limit) && isGameSize(limit)

export function pointsBudgetError(limit: number, requested: number | null | undefined): string | null {
  const budget = customPointsBudget(limit, requested)
  if (budget === null) return null
  if (!allowsPointsBudget(limit)) return 'This battle size has a fixed points total.'
  if (!Number.isInteger(budget)) return 'Enter a whole number of points.'
  if (budget < POINTS_BUDGET_MIN || budget > POINTS_BUDGET_MAX)
    return `Choose between ${POINTS_BUDGET_MIN} and ${POINTS_BUDGET_MAX.toLocaleString('en')} points.`
  return null
}

/** A budget equal to the battle size's own total is no custom budget at all. */
export const customPointsBudget = (limit: number, budget: number | null | undefined): number | null =>
  budget === null || budget === undefined || budget === limit ? null : budget

/** What a roster may spend: its custom budget, or else its battle size's points total. */
export const pointsBudgetOf = (roster: { limit: number; pointsBudget?: number | null }): number => roster.pointsBudget ?? roster.limit

export const pointsLabel = (points: number): string => `${points.toLocaleString('en')} points`

/** "2,000-point", as in a 2,000-point army. */
export const pointsSize = (points: number): string => `${points.toLocaleString('en')}-point`

export const battleSizeName = (limit: number): string => GAME_SIZES.find((size) => size.limit === limit)?.name ?? pointsLabel(limit)

/** A standard size's name, or plain "Battle" for any other limit. */
export const battleSizeTitle = (limit: number): string => GAME_SIZES.find((size) => size.limit === limit)?.name ?? 'Battle'

export const battleSizeOptionLabel = (size: { name: string; limit: number }): string => `${size.name} · ${pointsLabel(size.limit)}`

/** The battle size whose limits apply, and beside it any custom points budget. */
export const battleSizeLabel = (limit: number, pointsBudget?: number | null): string =>
  pointsBudget === null || pointsBudget === undefined
    ? battleSizeName(limit)
    : `${battleSizeName(limit)} · ${pointsSize(pointsBudget)} budget`

/** Name every waivable format restriction here so legality and picker filtering read the same roster waiver. */
export const FORMAT_RULE_IDS = [
  'points-limit',
  'detachments',
  'detachment-points',
  'warlord',
  'kotc-infantry',
  'kotc-warlord',
  'kotc-epic-heroes',
  'kotc-toughness',
  'kotc-datasheet-copies',
] as const

export type FormatRuleId = (typeof FORMAT_RULE_IDS)[number]
export type FormatRule = { id: FormatRuleId; label: string; hint: string }

/** Whether a rule still applies, given what the roster has waived. */
export const enforces = (waived: readonly string[] | null | undefined, rule: FormatRuleId) => !waived?.includes(rule)

export const detachmentLimit = (limit: number, waived: readonly string[] = []) =>
  isKotcLimit(limit) && enforces(waived, 'detachments') ? 1 : DETACHMENTS_MAX

/** The format-specific cap for copies of one datasheet, before catalogue limits are applied. */
export const formatDatasheetLimit = (limit: number, repeatable: boolean, waived: readonly string[] = []) =>
  isKotcLimit(limit) && enforces(waived, 'kotc-datasheet-copies') ? (repeatable ? 2 : 1) : null

const hasUnitKeyword = (keywords: readonly string[], wanted: string) =>
  keywords.some((keyword) => keyword.trim().toLocaleLowerCase() === wanted)

export const kotcDatasheetRepeatable = (keywords: readonly string[]) =>
  hasUnitKeyword(keywords, 'battleline') || hasUnitKeyword(keywords, 'dedicated transport')

/** What this battle size restricts, in the order a player reads it. */
export function formatRules(limit: number | null, pointsBudget?: number | null, sizes?: readonly BattleSize[]): FormatRule[] {
  if (limit === null) return []
  const pointsLimit: FormatRule = {
    id: 'points-limit',
    label: 'Points limit',
    hint: `The roster costs at most ${pointsLabel(pointsBudget ?? limit)}`,
  }
  if (isKotcLimit(limit)) {
    return [
      pointsLimit,
      { id: 'detachments', label: 'One detachment', hint: 'The roster is built from exactly one detachment' },
      { id: 'kotc-infantry', label: 'Two Infantry units', hint: 'The roster holds at least two Infantry units' },
      { id: 'kotc-warlord', label: 'Character Warlord', hint: 'Exactly one Character unit is named as the Warlord' },
      { id: 'kotc-epic-heroes', label: 'No Epic Heroes', hint: 'Datasheets with the Epic Hero keyword may not be taken' },
      { id: 'kotc-toughness', label: 'Toughness cap', hint: 'Nothing above Toughness 9, and at most one Toughness 9 unit' },
      {
        id: 'kotc-datasheet-copies',
        label: 'Datasheet copies',
        hint: `At most ${formatDatasheetLimit(limit, false)} of each datasheet, or ${formatDatasheetLimit(limit, true)} for Battleline and Dedicated Transports`,
      },
    ]
  }
  const warlord: FormatRule = { id: 'warlord', label: 'Warlord', hint: 'Exactly one Character unit is named as the Warlord' }
  const budget = detachmentPointBudget(limit, sizes)
  return budget === null
    ? [pointsLimit, warlord]
    : [
        pointsLimit,
        { id: 'detachment-points', label: 'Detachment points', hint: `Detachments cost at most ${budget} DP together` },
        warlord,
      ]
}

/**
 * The restrictions a roster's own battle size imposes that it is not playing.
 *
 * The one answer to "is this list built to its format?", so the builder, the roster
 * chooser, a sealed event's sealing dialog and the opponent's view of an attached army all
 * say the same thing about the same list. Waivers a size does not impose are not
 * counted: an id kept from another size restricts nothing here.
 */
export const waivedFormatRules = (
  limit: number | null,
  waived: readonly string[] | undefined,
  pointsBudget?: number | null,
  sizes?: readonly BattleSize[],
): FormatRule[] => formatRules(limit, pointsBudget, sizes).filter((rule) => !enforces(waived, rule.id))

export function kotcUnitExclusions(
  unit: { keywords: readonly string[]; toughness: number | null },
  waived: readonly string[] = [],
): string[] {
  return [
    ...(enforces(waived, 'kotc-epic-heroes') && hasUnitKeyword(unit.keywords, 'epic hero') ? ['does not allow Epic Heroes'] : []),
    ...(enforces(waived, 'kotc-toughness') && unit.toughness !== null && unit.toughness > 9
      ? [`does not allow Toughness ${unit.toughness}`]
      : []),
  ]
}

/**
 * The detachment points the borrowed-disposition optional rule gives a roster to spend.
 *
 * Homebrew, and deliberately not the format's own economy. King of the Colosseum sets no
 * detachment point limit at all — a roster takes any one detachment at any cost — and
 * spends detachment points instead as the bid that decides who picks the twist. This
 * budget exists only inside the optional rule, so a roster whose detachment already costs
 * this much has nothing to borrow with and is told so rather than shown an empty choice.
 */
export const BORROWED_DISPOSITION_BUDGET = 3

/**
 * The homebrew a battle size can be played with, and the mirror of `FORMAT_RULE_IDS`.
 *
 * A format rule is played until a roster waives it; a optional rule is not played until a
 * roster picks it. Neither is ever inferred from the list in front of it, so nobody is
 * handed a rule their group did not agree to play, and a size that offers no homebrew
 * offers nothing to switch on.
 */
export const OPTIONAL_RULE_IDS = ['kotc-borrowed-disposition'] as const

export type OptionalRuleId = (typeof OPTIONAL_RULE_IDS)[number]
export type OptionalRule = { id: OptionalRuleId; label: string; hint: string }

/** Whether a roster picked a optional rule, which is the only way one is played. */
export const plays = (picked: readonly string[] | undefined, rule: OptionalRuleId) => Boolean(picked?.includes(rule))

/** What homebrew this battle size offers, in the order a player reads it. */
export function optionalRules(limit: number | null): OptionalRule[] {
  if (!isKotcLimit(limit)) return []
  return [
    {
      id: 'kotc-borrowed-disposition',
      label: 'Borrowed disposition',
      hint: `Spend what your detachment leaves unspent, out of a house allowance of ${BORROWED_DISPOSITION_BUDGET} DP, to play another detachment's Force Disposition`,
    },
  ]
}

/** The homebrew a roster is playing that its own battle size offers. */
export const pickedOptionalRules = (limit: number | null, picked: readonly string[] | undefined): OptionalRule[] =>
  optionalRules(limit).filter((rule) => plays(picked, rule.id))

/** A borrowed disposition requires an explicit optional-rule choice and a known price; it grants no rules, enhancements, or stratagems from that detachment. */
export function borrowedDispositionError(
  limit: number | null,
  picked: readonly string[] | undefined,
  own: { points: number | null } | null,
  borrowed: { points: number | null } | null,
): string | null {
  if (!borrowed) return null
  if (!isKotcLimit(limit)) return 'Only a King of the Colosseum roster may borrow another detachment’s Force Disposition.'
  if (!plays(picked, 'kotc-borrowed-disposition')) return 'This roster is not playing the borrowed disposition optional rule.'
  if (!own || own.points === null || borrowed.points === null)
    return 'One of these detachments has no points value, so the borrowed disposition cannot be paid for.'
  const spent = own.points + borrowed.points
  return spent > BORROWED_DISPOSITION_BUDGET
    ? `This combination costs ${spent} DP; the borrowed disposition rule allows ${BORROWED_DISPOSITION_BUDGET} DP.`
    : null
}

export function detachmentPointsError(
  detachments: readonly { points: number | null }[],
  allowance: number | null,
  waived: readonly string[] = [],
): string | null {
  if (allowance === null || !enforces(waived, 'detachment-points')) return null
  const spent = detachments.reduce((total, detachment) => total + (detachment.points ?? 0), 0)
  return spent > allowance
    ? `${detachments.length === 1 ? 'This detachment costs' : 'This combination costs'} ${spent} DP; detachments at this battle size may cost at most ${allowance} DP.`
    : null
}

type TableBuilt = {
  limit: number
  pointsBudget?: number | null
  waivedRules?: readonly string[] | null
  units?: readonly { points: number }[]
}
/** `units` is the army as fielded, which a battle view carries beside a list whose own units it leaves out. */
type TableArmies = { players: readonly { side: number; roster: { built?: TableBuilt } | null; units?: readonly { points: number }[] }[] }

/**
 * Whether a built list may sit at this battle.
 *
 * The size is a ceiling, so an ally brings an Incursion list to a Strike Force table, and only a list that waives its
 * points limit may be built bigger. A duel in an older log, or at King of the Colosseum's fixed totals, plays lists built
 * at exactly its size.
 */
export function fitsBattleSize(settings: Pick<BattleSettings, 'limit' | 'teamBattle' | 'sizeFromSides'>, built: TableBuilt): boolean {
  const { limit, teamBattle } = settings
  if (limit === null) return true
  if (!teamBattle && (!settings.sizeFromSides || isKotcLimit(limit) || isKotcLimit(built.limit))) return built.limit === limit
  return built.limit <= limit || !enforces(built.waivedRules, 'points-limit')
}

/** How many armies a side brings: its places when the battle counts them, so an ally still to join counts, else who sits there. */
const sideArmies = (state: TableArmies & { settings?: Pick<BattleSettings, 'places'> }, side: number) =>
  state.settings?.places?.[side] ?? sidePlayers(state, side).length

/** An even share of the battle size for each army on a side, which a team battle plays unless the table sets its own. */
export function evenArmyPoints(state: TableArmies & { settings: BattleSettings }, side: number): number | null {
  const armies = sideArmies(state, side)
  return state.settings.limit === null ? null : state.settings.limit / Math.max(1, armies)
}

/** What each army on a side may spend in a team battle. */
export const armyPointsFor = (state: TableArmies & { settings: BattleSettings }, side: number): number | null =>
  state.settings.armyPoints?.[side] ?? evenArmyPoints(state, side)

export const pointsSpent = (built: Pick<TableBuilt, 'units'>) => built.units?.reduce((total, unit) => total + unit.points, 0) ?? 0

/** Whether a list spends no more than the points its army may, unless it waives its points limit. */
export const withinArmyPoints = (built: Pick<TableBuilt, 'units' | 'waivedRules'>, points: number) =>
  !enforces(built.waivedRules, 'points-limit') || pointsSpent(built) <= points

/** Whether allies who share their points spend no more than `total` between them; a list that waives its points limit is not counted. */
export const withinSharedArmyPoints = (armies: readonly Pick<TableBuilt, 'units' | 'waivedRules'>[], total: number) =>
  armies.reduce((spent, built) => spent + (enforces(built.waivedRules, 'points-limit') ? pointsSpent(built) : 0), 0) <= total

/** What a side's armies may spend together when they share their points, or null when each army spends its own. */
export function sharedSidePoints(state: TableArmies & { settings: BattleSettings }, side: number): number | null {
  const armies = sideArmies(state, side)
  const points = armyPointsFor(state, side)
  const shares = state.settings.sharedArmyPoints || battleCapacity(state.settings) === 3
  return shares && armies > 1 && points !== null ? points * armies : null
}

type TeamArmyProblem = { code: 'over-army-points' | 'allies-mismatch'; side: number; message: string }

/**
 * What stops a team battle's armies from playing, side by side.
 *
 * Each army spends no more than its side's points per army, unless it waives its points limit, and allies bring lists
 * saved to the same points total so neither half of a side is the bigger one. Allies who share their points may split
 * them any way, so only their total counts.
 */
export function teamArmyProblems(state: TableArmies & { settings: BattleSettings }): TeamArmyProblem[] {
  if (!state.settings.teamBattle || state.settings.limit === null) return []
  return [0, 1].flatMap((side) => {
    const armies = state.players.flatMap((player) =>
      player.side === side && player.roster?.built ? [{ ...player.roster.built, units: player.units ?? player.roster.built.units }] : [],
    )
    const points = armyPointsFor(state, side)
    const shared = sharedSidePoints(state, side)
    const problems: TeamArmyProblem[] = []
    if (
      shared !== null ? !withinSharedArmyPoints(armies, shared) : points !== null && armies.some((army) => !withinArmyPoints(army, points))
    )
      problems.push({
        code: 'over-army-points',
        side,
        message:
          shared !== null ? `allies spend more than their ${pointsLabel(shared)}` : `an army spends more than its ${pointsLabel(points!)}`,
      })
    if (shared === null && new Set(armies.map(pointsBudgetOf)).size > 1)
      problems.push({ code: 'allies-mismatch', side, message: 'allies bring lists saved to the same points total' })
    return problems
  })
}

/** Each built army's points allowance, which a duel's two lists agree on. */
const sideAllowances = (state: TableArmies): number[] =>
  state.players.flatMap((player) => (player.roster?.built ? [pointsBudgetOf(player.roster.built)] : []))

/**
 * What each side's lists add up to, by side, with an ally who has not joined or chosen yet counted at their partner's list. A side
 * with no list yet adds up to nothing.
 */
export function sidePoints(state: TableArmies & { settings?: Pick<BattleSettings, 'places'> }): number[] {
  return [0, 1].map((side) => {
    const chosen = sidePlayers(state, side).flatMap((player) => (player.roster?.built ? [pointsBudgetOf(player.roster.built)] : []))
    return chosen.length ? chosen.reduce((total, points) => total + points, 0) + chosen[0]! * (sideArmies(state, side) - chosen.length) : 0
  })
}

/**
 * Each side that may spend fewer points than the other, which plays short rather than being refused. A side counts its
 * lists up to what it may spend at this table, so allies' lists saved bigger than their share never read as more.
 */
export function shortSides(state: TableArmies & { settings: BattleSettings }): { side: number; points: number; against: number }[] {
  const { limit, sizeFromSides, teamBattle } = state.settings
  // A side nobody sits on yet has no lists to fall short with.
  const unseated = [0, 1].some((side) => !sidePlayers(state, side).length)
  if (!sizeFromSides || limit === null || unseated || state.players.some((player) => !player.roster?.built)) return []
  const allowance = (side: number) =>
    teamBattle
      ? (sharedSidePoints(state, side) ?? armyPointsFor(state, side)! * sideArmies(state, side))
      : (battlePointsBudget(state) ?? limit)
  const points = sidePoints(state).map((value, side) => Math.min(value, allowance(side)))
  const against = Math.max(...points)
  return points.flatMap((value, side) => (value < against ? [{ side, points: value, against }] : []))
}

type RosterFormat = { limit: number | null; problem: 'missing' | 'manual' | 'mismatch' | 'budget-mismatch' | 'unsupported' | null }

/**
 * The battle size the bigger side's lists make: a lone list its own format, and allies the smallest size their lists
 * added together fit, so two Incursion lists make a Strike Force side. Known from the first list chosen.
 */
function sideBattleFormat(state: TableArmies & { settings: BattleSettings }): RosterFormat {
  const chosen = state.players.flatMap((player) => (player.roster ? [player.roster] : []))
  if (!chosen.length) return { limit: null, problem: 'missing' }
  if (chosen.some((roster) => !roster.built)) return { limit: null, problem: 'manual' }
  const formats = chosen.map((roster) => roster.built!.limit)
  if (formats.some(isKotcLimit)) {
    if (state.settings.teamBattle) return { limit: null, problem: 'unsupported' }
    return formats.every((limit) => limit === formats[0]) ? { limit: formats[0]!, problem: null } : { limit: null, problem: 'mismatch' }
  }
  const totals = sidePoints(state)
  let limit = Math.max(...formats)
  for (const side of [0, 1]) {
    if (sideArmies(state, side) < 2) continue
    const size = GAME_SIZES.find((candidate) => !isKotcLimit(candidate.limit) && candidate.limit >= totals[side]!)
    if (!size) return { limit: null, problem: 'unsupported' }
    limit = Math.max(limit, size.limit)
  }
  return { limit, problem: null }
}

/** The battle size the armies' formats make; custom budgets never change it, they only have to agree. */
export function rosterBattleFormat(state: TableArmies & { settings: BattleSettings }): RosterFormat {
  if (state.settings.sizeFromSides) return sideBattleFormat(state)
  if (state.players.length !== battleCapacity(state.settings) || state.players.some((player) => !player.roster))
    return { limit: null, problem: 'missing' }
  if (state.players.some((player) => !player.roster?.built)) return { limit: null, problem: 'manual' }
  const limits = state.players.map((player) => player.roster!.built!.limit)
  if (state.settings.teamBattle) {
    // The biggest list sets a team battle's size, which every other list may be built at or below.
    const limit = Math.max(...limits)
    return isKotcLimit(limit) ? { limit: null, problem: 'unsupported' } : { limit, problem: null }
  }
  const limit = limits[0]
  if (!limits.every((value) => value === limit)) return { limit: null, problem: 'mismatch' }
  const size = GAME_SIZES.find((candidate) => candidate.limit === limit)
  if (!size) return { limit: null, problem: 'unsupported' }
  return pointsBudgetsAgree(state) ? { limit: size.limit, problem: null } : { limit: null, problem: 'budget-mismatch' }
}

/** Whether every built army at the table brings the same points allowance per side. */
export const pointsBudgetsAgree = (state: TableArmies): boolean => new Set(sideAllowances(state)).size <= 1

/** The points budget a duel plays to, when it is not the battle size's own total: the one both lists agree on, or the bigger list's. */
export function battlePointsBudget(state: TableArmies & { settings: BattleSettings }): number | null {
  const allowances = sideAllowances(state)
  if (state.settings.limit === null || state.settings.teamBattle || !allowances.length) return null
  if (state.settings.sizeFromSides) return customPointsBudget(state.settings.limit, Math.max(...allowances))
  return pointsBudgetsAgree(state) ? customPointsBudget(state.settings.limit, allowances[0]) : null
}

/** A team battle's points per army as a table says them, side by side: "1,750 vs 800 + 800", or "2,000 vs 2,000 shared". */
export function armyPointsText(state: TableArmies & { settings: BattleSettings }): string {
  return [0, 1]
    .map((side) => {
      const shared = sharedSidePoints(state, side)
      if (shared !== null) return `${shared.toLocaleString('en')} shared`
      const points = armyPointsFor(state, side)?.toLocaleString('en') ?? '?'
      const armies = Math.max(1, sideArmies(state, side))
      return Array.from({ length: armies }, () => points).join(' + ')
    })
    .join(' vs ')
}

/** A battle's size as its screens name it: its points, or its size beside the custom budget its armies agree on. */
export function battleSizeText(state: TableArmies & { settings: BattleSettings }): string | null {
  if (!state.settings.limit) return null
  if (state.settings.teamBattle) return `${battleSizeName(state.settings.limit)} · ${armyPointsText(state)}`
  const budget = battlePointsBudget(state)
  return budget === null ? pointsLabel(state.settings.limit) : battleSizeLabel(state.settings.limit, budget)
}
