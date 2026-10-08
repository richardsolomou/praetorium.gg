import { routeSlug } from '../core/slug'
import { compareText } from '../core/text'
import type { Mission, MissionCard, Award, AwardTrigger } from './rulesCards'
import { english, type MissionPack } from './missionPacks'
import { actionsIn } from './missionActions'
import { criteriaKey } from './missionCriteria'
import type { WhenDrawn } from '../contracts/missions'

type RecordValue = Record<string, unknown>
const records = (value: unknown): RecordValue[] =>
  Array.isArray(value) ? value.filter((entry): entry is RecordValue => Boolean(entry) && typeof entry === 'object') : []

const roundOf = (period: string) =>
  ({ firstBattleRound: 1, secondBattleRound: 2, thirdBattleRound: 3, fourthBattleRound: 4, fifthBattleRound: 5 })[
    period as 'firstBattleRound'
  ]

function triggers(when: string | null, periods: unknown): AwardTrigger[] {
  if (!when) return []
  const normalized = when.toLowerCase().replaceAll('’', "'").replace(/\.$/, '')
  const rounds = Array.isArray(periods)
    ? periods.flatMap((period) => (typeof period === 'string' ? [roundOf(period)] : [])).filter(Boolean)
    : []
  const range = { roundMin: rounds.length ? Math.min(...rounds) : null, roundMax: rounds.length ? Math.max(...rounds) : null }
  const base = { ...range, phase: null, playerTurn: null } satisfies Omit<AwardTrigger, 'timing'>
  if (normalized === 'end of your command phase (or the end of your turn in the fifth battle round)') {
    return [
      { ...base, timing: 'end-of-phase', phase: 'command', playerTurn: 'your-turn', roundMax: 4 },
      { ...base, timing: 'end-of-turn', playerTurn: 'your-turn', roundMin: 5 },
    ]
  }
  if (normalized === 'end of your command phase') return [{ ...base, timing: 'end-of-phase', phase: 'command', playerTurn: 'your-turn' }]
  if (normalized === 'end of your turn') return [{ ...base, timing: 'end-of-turn', playerTurn: 'your-turn' }]
  if (normalized === "end of your opponent's turn") return [{ ...base, timing: 'end-of-turn', playerTurn: 'opponent-turn' }]
  if (normalized === "end of your opponent's turn or the end of the fifth battle round (whichever comes first)")
    return [{ ...base, timing: 'end-of-turn-or-final-round', playerTurn: 'opponent-turn' }]
  if (normalized === 'end of a turn') return [{ ...base, timing: 'end-of-turn', playerTurn: 'either' }]
  return []
}

function whenDrawn(text: string | null, ids: ReadonlyMap<string, string>): WhenDrawn | null {
  if (!text) return null
  const plain = text.replaceAll('**', '').replaceAll('‑', '-').replaceAll(/\s+/g, ' ')
  const firstRound =
    /^WHEN DRAWN: If it is the first battle round, (you can )?draw one new Secondary Mission card and shuffle this card back into your Secondary Mission deck\.?$/i.exec(
      plain,
    )
  if (firstRound) return { operation: 'redraw', roundMax: 1, required: !firstRound[1], heldCards: [], condition: null }
  const paired =
    /^WHEN DRAWN: If the (.+?) Secondary Mission is active for you, you can draw one new Secondary Mission card and shuffle this card back into your Secondary Mission deck\.?$/i.exec(
      plain,
    )
  if (paired) {
    const id = ids.get(criteriaKey(paired[1]!))
    return id ? { operation: 'redraw', roundMax: null, required: false, heldCards: [id], condition: null } : null
  }
  const replacement = /^WHEN DRAWN: If (.+?), you can discard this card and draw one new Secondary Mission card\.?$/i.exec(plain)
  return replacement
    ? { operation: 'replace', roundMax: null, heldCards: [], condition: replacement[1]!.replace(/^there /i, 'there ') }
    : null
}

function cardOf(raw: RecordValue, actions: ReturnType<typeof actionsIn>, ids: ReadonlyMap<string, string>): MissionCard | null {
  const name = english(raw.name)
  if (!name || typeof raw.id !== 'string') return null
  const awards: Award[] = records(raw.objectives).flatMap((objective) => {
    const scorings = records(objective.scoring)
    const exclusiveModes = new Set(
      scorings
        .filter((scoring) => scoring.isMutuallyExclusive === true)
        .map((scoring) => (typeof scoring.scoringType === 'string' ? scoring.scoringType : '')),
    )
    return scorings.flatMap((scoring) => {
      const vp = scoring.victoryPoints
      const criteria = english(scoring.scoringCriteria)
      if (typeof vp !== 'number' || vp <= 0 || !criteria) return []
      const mode = typeof scoring.scoringType === 'string' ? scoring.scoringType : ''
      return triggers(english(objective.whenText), objective.scorablePeriods).map((trigger) => ({
        vp,
        per: scoring.inputType === 'stepper' && /^for each\b/i.test(criteria) ? 'each' : null,
        max: typeof scoring.victoryPointsCap === 'number' ? scoring.victoryPointsCap : null,
        mode: mode || null,
        group: exclusiveModes.has(mode) && typeof objective.id === 'string' ? `${objective.id}:${mode}` : null,
        cumulative: scoring.isCumulative === true,
        criteria,
        trigger,
      }))
    })
  })
  return {
    key: raw.id,
    name,
    text: english(raw.description),
    awards,
    actions: actions.get(criteriaKey(name)) ?? [],
    whenDrawn: whenDrawn(english(raw.description), ids),
  }
}

export function missionCardsFromDatacards(packs: readonly MissionPack[]): { primaries: MissionCard[]; secondaries: MissionCard[] } {
  const actions = actionsIn(packs)
  const ids = new Map(
    packs.flatMap((pack) =>
      records(pack.secondaryMissions).flatMap((card) => {
        const name = english(card.name)
        return name && typeof card.id === 'string' ? [[criteriaKey(name), card.id] as const] : []
      }),
    ),
  )
  const collect = (field: 'primaryMissions' | 'secondaryMissions') =>
    packs
      .filter((pack) => pack.isCombatPatrol !== true)
      .flatMap((pack) => records(pack[field]).flatMap((raw) => cardOf(raw, actions, ids) ?? []))
      .sort((a, b) => compareText(a.name, b.name))
  return { primaries: collect('primaryMissions'), secondaries: collect('secondaryMissions') }
}

export function missionsFromDatacards(packs: readonly MissionPack[]): Map<string, Mission> {
  const missions = new Map<string, Mission>()
  for (const pack of packs) {
    if (pack.isCombatPatrol === true) continue
    const source = english(pack.name)
    if (!source) continue
    const packId = routeSlug(source)
    for (const card of records(pack.primaryMissions)) {
      const name = english(card.name)
      if (!name || typeof card.id !== 'string') continue
      for (const disposition of records(card.forceDispositions)) {
        const friendly = typeof disposition.friendly === 'string' ? routeSlug(disposition.friendly) : null
        const opposition = typeof disposition.opposition === 'string' ? routeSlug(disposition.opposition) : null
        if (!friendly || !opposition) continue
        const deploymentIds = new Set<string>()
        for (const presetName of Array.isArray(disposition.recommendedPresets) ? disposition.recommendedPresets : []) {
          if (typeof presetName !== 'string') continue
          const preset = records(pack.presets).find((entry) => english(entry.name) === presetName)
          const deployment =
            preset && typeof preset.deployment === 'string'
              ? records(pack.deployments).find((entry) => english(entry.name) === preset.deployment)
              : null
          if (deployment && typeof deployment.id === 'string') deploymentIds.add(deployment.id)
        }
        const mission: Mission = {
          id: card.id,
          name,
          roundCap: typeof pack.primaryMissionScoreBattleRoundLimit === 'number' ? pack.primaryMissionScoreBattleRoundLimit : null,
          gameCap: typeof pack.primaryMissionScoreGameLimit === 'number' ? pack.primaryMissionScoreGameLimit : null,
          secondaryRoundCap:
            typeof pack.secondaryMissionScoreBattleRoundLimit === 'number' ? pack.secondaryMissionScoreBattleRoundLimit : null,
          secondaryGameCap: typeof pack.secondaryMissionScoreGameLimit === 'number' ? pack.secondaryMissionScoreGameLimit : null,
          source,
          packId,
          deploymentIds: [...deploymentIds],
        }
        missions.set(`${packId}|${friendly}|${opposition}`, mission)
        if (!missions.has(`${friendly}|${opposition}`)) missions.set(`${friendly}|${opposition}`, mission)
      }
    }
  }
  return missions
}

export function dispositionsFromDatacards(packs: readonly MissionPack[]) {
  const found = new Map<string, { id: string; name: string; text: string | null }>()
  for (const pack of packs) {
    for (const value of records(pack.forceDispositions)) {
      const name = english(value.name)
      if (name) found.set(routeSlug(name), { id: routeSlug(name), name, text: english(value.description) })
    }
  }
  return [...found.values()]
}
