import { asSecondary, commandRefusal, reduceBattle, type Command, type LoggedCommand, type Phase } from '../core/battle'
import { SAMPLE_SEAT } from '../core/newBattle'
import { rosterSnapshot } from '../core/rosterSnapshot'
import { sideStratagems } from '../core/sideStratagems'
import { terrainMatchupIds } from '../contracts/terrainReference'
import { battleDetachmentData, selectedBattleDetachmentData } from '../shared/battleDetachmentData'
import { resolvedMissionForSide, scoringCapError, setupReferenceError } from '../shared/battleRules'
import { unitBattleDetailsIn } from '../shared/catalogue'
import type { LoadedCatalogue } from '../shared/catalogueIndex'
import { calculateRosterPrice } from '../shared/pricing'
import type { LoadedRules } from '../shared/rules'
import type { BattleHistory } from './spacetimeRepository'
import { SAMPLE_BATTLE_TOKEN } from '../contracts/battles'

const AURELIA = `${SAMPLE_SEAT}aurelia` as const
const VARRO = `${SAMPLE_SEAT}varro` as const
/** How far the game moves each player's rating, made up like the rest, so the finished game shows where a result lands. */
export const SAMPLE_RATING_CHANGES: Readonly<Record<string, number>> = { [AURELIA]: 14, [VARRO]: -14 }
const MISSION_PACK = 'chapter-approved-2026-2027'
const SIDES = [AURELIA, VARRO] as const

/** Two Incursion lists, by catalogue entry, so each is priced and fielded from today's data like any saved roster. */
const ARMIES = [
  {
    id: 'sample-gladius',
    name: 'Gladius Spearhead',
    catalogueId: 'e0af-67df-9d63-8fb7',
    detachmentIds: ['d2dc-693e-b491-b16d'],
    disposition: 'priority-assets',
    limit: 1_000,
    waivedRules: [],
    picks: [
      { entryId: '91e3-a419-8c58-98f5', toggles: { 'a89c-b01e-ffab-8ebb': 1 } },
      { entryId: '9770-3a56-619e-f390', attachedTo: 3 },
      { entryId: 'cd69-af58-774-d387', attachedTo: 4 },
      { entryId: '85b1-eb9a-17a6-e5be' },
      { entryId: 'c432-5254-8a25-6c8a' },
      { entryId: '4c8-e877-566b-a1ee' },
      { entryId: 'fcb6-80ca-22a-4771' },
      { entryId: 'efc9-2aff-c5b-6790' },
      { entryId: '13d8-1933-472c-80ed' },
    ],
    secondaries: ['Engage On All Fronts', 'A Grievous Blow'],
  },
  {
    id: 'sample-berzerkers',
    name: 'Berzerker Warband',
    catalogueId: 'df9a-59b2-f464-59ad',
    detachmentIds: ['3490-ec82-70b3-c5cf'],
    disposition: 'purge-the-foe',
    limit: 1_000,
    waivedRules: [],
    picks: [
      { entryId: '1cfc-2dc0-2a7a-28fe', toggles: { '3578-501d-c196-f54d': 1 } },
      { entryId: 'b250-a2f9-7098-353d' },
      { entryId: '8568-71db-b833-93d5' },
      { entryId: '96aa-4baa-2cb2-da3d' },
      { entryId: 'e213-0676-347e-9292' },
      { entryId: '891d-f175-70de-994e' },
      { entryId: 'f867-cbc9-d166-18eb' },
      { entryId: 'ca7d-c77a-28e2-7b6b' },
      { entryId: '6afa-65ac-21df-090d' },
    ],
    secondaries: ['Assassination', 'Bring It Down'],
  },
]

/** What happened in one player's turn, by phase: stratagems either side used, enemy units destroyed, and what each card paid. */
type Turn = {
  by: (typeof SIDES)[number]
  stratagems?: Partial<Record<Phase, { name: string; by: (typeof SIDES)[number] }[]>>
  destroyed?: Partial<Record<Phase, string[]>>
  scores?: Partial<Record<Phase, Record<string, number>>>
}

const aurelia = (name: string) => ({ name, by: AURELIA })
const varro = (name: string) => ({ name, by: VARRO })

/** An Incursion game Aurelia wins, scored the way a guided table scores it. */
const TURNS: Turn[] = [
  { by: AURELIA, stratagems: { command: [aurelia('Adaptive Strategy')] }, scores: { end: { primary: 4, 'Engage On All Fronts': 2 } } },
  {
    by: VARRO,
    stratagems: { movement: [varro('Apoplectic Frenzy')] },
    destroyed: { fight: ['Assault Intercessor Squad'] },
    scores: { end: { primary: 5 } },
  },
  {
    by: AURELIA,
    stratagems: { shooting: [aurelia('Storm of devastation')] },
    destroyed: { shooting: ['Jakhals'], fight: ['Eightbound'] },
    scores: { command: { primary: 3 }, end: { primary: 4, 'Engage On All Fronts': 4, 'A Grievous Blow': 4 } },
  },
  {
    by: VARRO,
    stratagems: { fight: [varro('Skulls for the Skull Throne!')] },
    destroyed: { fight: ['Intercessor Squad', 'Rhino'] },
    scores: { command: { primary: 3 }, end: { primary: 6, 'Bring It Down': 4 } },
  },
  {
    by: AURELIA,
    stratagems: { fight: [aurelia('Might of angels')] },
    destroyed: { shooting: ['Maulerfiend'], fight: ['Khârn the Betrayer'] },
    scores: { command: { primary: 4 }, end: { primary: 5, 'Engage On All Fronts': 4, 'A Grievous Blow': 4 } },
  },
  {
    by: VARRO,
    stratagems: { fight: [aurelia('Armour of Contempt')] },
    destroyed: { fight: ['Captain'] },
    scores: { command: { primary: 3 }, end: { primary: 6, Assassination: 3 } },
  },
  {
    by: AURELIA,
    stratagems: { charge: [aurelia('Crushing Impact')] },
    destroyed: { shooting: ['Helbrute'], fight: ['Master of Executions'] },
    scores: { command: { primary: 4 }, end: { primary: 5, 'Engage On All Fronts': 4, 'A Grievous Blow': 4 } },
  },
  {
    by: VARRO,
    stratagems: { fight: [varro('Frenzied Resilience')] },
    destroyed: { fight: ['Hellblaster Squad'] },
    scores: { command: { primary: 3 }, end: { primary: 6 } },
  },
  {
    by: AURELIA,
    stratagems: { shooting: [aurelia('Command Re-roll')] },
    destroyed: { shooting: ['Exalted Eightbound'] },
    scores: { end: { primary: 8, 'Engage On All Fronts': 2 } },
  },
  {
    by: VARRO,
    stratagems: { fight: [varro('Hack and Slash')] },
    destroyed: { fight: ['Redemptor Dreadnought'] },
    scores: { end: { primary: 6, 'Bring It Down': 4 } },
  },
]

/** Minutes each phase takes at the table, so the turn times read like a real evening's game. */
const PHASE_MINUTES: Record<Phase, number> = { command: 1, movement: 3, shooting: 4, charge: 2, fight: 3, end: 1 }
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/**
 * A finished Incursion game between two made-up players, which nothing stores.
 *
 * Every command goes through the same refusal checks a table's commands do, and its
 * scoring prompts are answered where the fold raises them, so the log is one a real
 * battle would have accepted; a data update that breaks that fails here, not on screen.
 */
function playSampleBattle(catalogues: ReadonlyMap<string, LoadedCatalogue | null>, rules: LoadedRules, startedAt: number): BattleHistory {
  const fielded = ARMIES.map((army) => {
    const catalogue = catalogues.get(army.catalogueId)
    const priced = catalogue && calculateRosterPrice({ ...army, units: army.picks }, catalogue, rules)
    const data = catalogue && battleDetachmentData(catalogue, rules, army.catalogueId)
    if (!priced || !data || priced.errors.length) throw new Error(`the sample battle's ${army.name} no longer builds`)
    const roster = rosterSnapshot(
      army,
      priced,
      unitBattleDetailsIn(
        catalogue,
        army.catalogueId,
        army.picks.map((pick) => pick.entryId),
      ),
    )
    const detachments = roster.built?.detachments?.map((detachment) => detachment.name) ?? []
    const pool = selectedBattleDetachmentData(data, detachments)
    return { army, roster, stratagems: sideStratagems([{ detachments, stratagems: pool.stratagems }], pool.core) }
  })

  const log: LoggedCommand[] = []
  let at = startedAt
  const state = () => reduceBattle(SIDES, log, [0, 1])
  const send = (by: string, command: Command, minutes = 0.25) => {
    const current = state()
    const refusal =
      commandRefusal(current, by, command) ??
      (command.kind === 'begin-battle'
        ? setupReferenceError(current, rules)
        : command.kind === 'score-settlement'
          ? scoringCapError(current, by, command, rules)
          : null)
    if (refusal) throw new Error(`the sample battle refused ${command.kind} at ${log.length + 1}: ${refusal.message}`)
    at += minutes * MINUTE
    log.push({ seq: log.length + 1, by, at, command })
  }
  const card = (name: string) => {
    const found = rules.secondaries.find((secondary) => secondary.name === name)
    if (!found) throw new Error(`the sample battle's ${name} card is gone`)
    return asSecondary(found)
  }

  send(AURELIA, {
    kind: 'configure-battle',
    limit: 1_000,
    missionPackId: MISSION_PACK,
    terrainLayoutId: null,
    twistId: null,
    clockLimitMinutes: null,
  })
  fielded.forEach(({ roster }, side) => send(SIDES[side]!, { kind: 'attach-roster', roster, prep: null, painted: true }, 1))
  const matchups = terrainMatchupIds(fielded.map(({ army }) => army.disposition))
  const layout = rules.terrainLayouts.find((candidate) => matchups.includes(candidate.matchupId) && candidate.deploymentId)
  if (!layout?.deploymentId) throw new Error('the sample battle has no battlefield')
  send(AURELIA, { kind: 'set-battlefield', patternId: layout.deploymentId, terrainLayoutId: layout.id }, 1)
  send(AURELIA, { kind: 'set-attacker', attackerId: VARRO })
  fielded.forEach(({ army, stratagems }, side) => {
    const missionId = resolvedMissionForSide(state(), rules, side)?.id
    const primary = rules.primaries.find((candidate) => candidate.key === missionId)
    send(
      SIDES[side]!,
      {
        kind: 'set-prep',
        stratagems,
        secondaries: army.secondaries.map(card),
        secondaryDeck: rules.secondaries.map(asSecondary),
        primary: primary ? asSecondary(primary) : null,
        secondaryMode: 'fixed',
      },
      2,
    )
  })
  send(AURELIA, { kind: 'begin-battle', firstPlayerId: AURELIA }, 3)

  for (const turn of TURNS) {
    if (state().pendingSettlement) send(turn.by, { kind: 'settle-opponent-turn' })
    for (let step = 0; step < 6; step++) {
      const current = state()
      const phase = current.phase
      for (const { name, by } of turn.stratagems?.[phase] ?? []) {
        const key = current.players.find((player) => player.id === by)?.stratagems.find((stratagem) => stratagem.name === name)?.key
        if (!key) throw new Error(`the sample battle's ${name} stratagem is gone`)
        send(by, { kind: 'use-stratagem', key, playerId: by }, 1)
      }
      for (const name of turn.destroyed?.[phase] ?? []) {
        const target = state().players.find((player) => player.id !== turn.by)!
        const unit = target.units.find((candidate) => candidate.name === name && !candidate.destroyed)
        if (!unit) throw new Error(`the sample battle's ${name} is gone`)
        send(turn.by, { kind: 'set-unit', unitKey: unit.key, destroyed: true, playerId: target.id })
      }
      const minutes = PHASE_MINUTES[phase]
      if (!commandRefusal(state(), turn.by, { kind: 'advance' })) {
        send(turn.by, { kind: 'advance' }, minutes)
        continue
      }
      // The phase ends on a scoring prompt, answered with what the board paid.
      send(turn.by, { kind: 'request-advance' }, minutes)
      const paid = turn.scores?.[phase] ?? {}
      const player = state().players.find((candidate) => candidate.id === turn.by)!
      const scores = Object.entries(paid).map(([name, delta]) =>
        name === 'primary'
          ? { category: 'primary' as const, delta }
          : { category: 'secondary' as const, key: player.secondaries.find((secondary) => secondary.name === name)!.key, delta },
      )
      send(turn.by, scores.length ? { kind: 'score-settlement', scores, playerId: turn.by } : { kind: 'acknowledge-scoring' }, 0.5)
      if (state().status === 'playing') send(turn.by, { kind: 'advance' })
    }
  }
  // The first player's cards that score on the opponent's turn settle last, which completes the battle.
  send(AURELIA, { kind: 'settle-opponent-turn' }, 3)
  if (state().status !== 'finished') throw new Error('the sample battle did not finish')

  return {
    battle: { id: SAMPLE_BATTLE_TOKEN, token: SAMPLE_BATTLE_TOKEN, createdAt: startedAt },
    players: [
      { id: AURELIA, name: 'Aurelia', image: null, side: 0, automated: false },
      { id: VARRO, name: 'Varro', image: null, side: 1, automated: false },
    ],
    log,
  }
}

let built: { rules: LoadedRules; history: Promise<BattleHistory> } | null = null

/** The sample game, built once per rules snapshot since every reader gets the same one; a failed build is retried on the next read. */
export function sampleBattleHistory(rules: LoadedRules | null, catalogueFor: (catalogueId: string) => Promise<LoadedCatalogue | null>) {
  if (!rules) throw new Response('Mission rules are unavailable right now.', { status: 503 })
  if (built?.rules !== rules) {
    const history = Promise.all(ARMIES.map(async ({ catalogueId }) => [catalogueId, await catalogueFor(catalogueId)] as const)).then(
      // The evening before it was built, so its clock never reads as a game played in the small hours.
      (catalogues) => playSampleBattle(new Map(catalogues), rules, Math.floor(Date.now() / DAY) * DAY - DAY + 18 * 60 * MINUTE),
    )
    built = { rules, history }
    history.catch(() => {
      if (built?.history === history) built = null
    })
  }
  return built.history
}
