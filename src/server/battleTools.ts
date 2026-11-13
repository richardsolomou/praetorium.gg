import { z } from 'zod'
import {
  asSecondary,
  builtDetachments,
  FIXED_SECONDARIES,
  isKotcLimit,
  mayNameCard,
  scoringDue,
  secondaryDrawTarget,
  sideCaptain,
  sideOwes,
  undrawnSecondaries,
  validate,
  type BattleState,
  type Command,
} from '../core/battle'
import type { BattleView } from '../core/battleView'
import { commandSchema, idSchema, rosterLimitSchema } from '../core/commands'
import { sideStratagems } from '../core/sideStratagems'
import { KOTC_MATCHUP_ID } from '../contracts/terrain'
import { terrainMatchupIds } from '../contracts/terrainReference'
import { createBattleSchema, submitSchema, tokenSchema } from '../contracts/schemas'
import { selectedBattleDetachmentData } from '../shared/battleDetachmentData'
import { setupReferenceError } from '../shared/battleRules'
import { gameReferencesFor } from '../shared/gameReferences'
import type { LoadedRules } from '../shared/rules'
import { resultOf, WRITE } from './accountMcp'
import { READ_ONLY_TOOL, type AgentTools } from './agentTools'
import { app } from './app'
import { startDraftBattle } from './mutationTelemetry'
import { battleInvitePath } from '../core/notifications'
import { submitBattleCommand } from './battleSubmission'
import { productActions } from './productActions'

/** The domain's own shape for a command kind, so the agent schema keeps every storage limit `commandSchema` holds. */
function commandShape(kind: Command['kind']) {
  const options = (commandSchema as unknown as z.ZodDiscriminatedUnion<z.ZodObject[]>).options
  const shape = options.find((option) => (option.shape.kind as z.ZodLiteral).value === kind)
  if (!shape) throw new Error(`No command shape for ${kind}`)
  return shape
}

const PLAYER = 'The seat this is for, a players[].id from get_my_battle; omit for your own seat.'

/** A command kind as agents read it: the domain's fields with what each one means. */
function command(kind: Command['kind'], description: string, fields: Record<string, string> = {}) {
  const shape = commandShape(kind)
  const described = Object.fromEntries(
    Object.entries(fields).map(([field, text]) => [field, (shape.shape[field] as z.ZodType).describe(text)]),
  )
  return shape.extend(described).describe(description)
}

const PLAYER_FIELD = { playerId: PLAYER }

const configureBattle = z
  .object({
    kind: z.literal('configure-battle'),
    limit: rosterLimitSchema
      .nullable()
      .optional()
      .describe(
        'Battle size in points: 1000, 2000 or 3000, or 600 for King of the Colosseum; null takes it from the rosters, where each side plays to its lists added together and the bigger side sets the size.',
      ),
    missionPackId: idSchema.nullable().optional().describe('A mission pack id from list_reference; null for none.'),
    twistId: idSchema.nullable().optional().describe('A twist id the chosen pack prints; null for none.'),
    manual: z.boolean().optional().describe('true tracks the battle by hand, without mission cards, stratagems or CP automation.'),
  })
  .describe('Format step: changes only the battle settings given and keeps the rest.')

const setSecondaries = z
  .object({
    kind: z.literal('set-secondaries'),
    mode: z.enum(['tactical', 'fixed']).describe('tactical draws cards during the battle; fixed keeps two chosen cards all game.'),
    fixed: z
      .array(z.string().min(1).max(64))
      .max(FIXED_SECONDARIES)
      .optional()
      .describe('With fixed, the two secondary card keys, from next.secondaryOptions where fixed is true.'),
    playerId: z.string().min(1).max(64).optional().describe('Any seat on the side to prepare; omit for your own side.'),
  })
  .describe(
    "Secondaries step: records the side's mission cards (its primary, the secondary deck and its stratagems) with the chosen secondary mode. Every side needs this before begin-battle.",
  )

const drawSecondaries = z
  .object({
    kind: z.literal('draw-secondaries'),
    keys: z
      .array(z.string().min(1).max(64))
      .min(1)
      .max(2)
      .optional()
      .describe('The exact tactical cards drawn at the table, by key; omit to have Praetorium deal them at random.'),
    playerId: z.string().min(1).max(64).optional().describe(PLAYER),
  })
  .describe("Command phase, tactical sides: draws the turn's owed cards together. Acknowledge them with acknowledge-draw.")

const attachSavedRoster = z
  .object({
    kind: z.literal('attach-saved-roster'),
    rosterId: z.string().min(1).max(64).describe('A roster id from list_my_rosters, built for this battle size.'),
    playerId: z.string().min(1).max(64).optional().describe(PLAYER),
  })
  .describe('Armies step: fields a saved roster on a seat, frozen as it is now. A place you play yourself fields one of your rosters.')

/**
 * The commands an agent records, each with what it means. Narrower than the site's
 * contract: rosters are fielded by id, and the mission cards and random draws the
 * page assembles from references are built here from the battle's own rules.
 */
export const agentCommandSchema = z.discriminatedUnion('kind', [
  configureBattle,
  attachSavedRoster,
  command('detach-roster', 'Armies step: removes the army from a seat during setup.', PLAYER_FIELD),
  command('set-painted', 'Armies step: battle ready (painted) armies score +10 VP at the start.', {
    painted: 'Whether the army is battle ready.',
    ...PLAYER_FIELD,
  }),
  command('set-side-warlord', 'Armies step, allied sides only: whose Warlord leads the side.', {
    side: 'The side index, 0 or 1, from players[].side.',
    playerId: 'The ally whose Warlord leads, from players[].warlordChoices.',
  }),
  command('set-side-disposition', 'Mission step, allied sides only: the Force Disposition the side plays.', {
    side: 'The side index, 0 or 1.',
    disposition: 'A Force Disposition id from players[].dispositionChoices.',
  }),
  command('set-battlefield', 'Battlefield step: the deployment and terrain layout.', {
    patternId: 'A deployment id from next.battlefields.',
    terrainLayoutId: 'Its terrain layout id from next.battlefields.',
  }),
  command('set-attacker', 'Defender step: after the roll-off, the attacker; the other side defends and deploys first.', {
    attackerId: 'The attacking side’s player id.',
  }),
  setSecondaries,
  command(
    'set-unit-formation',
    'Reserves step: where a unit starts; units left alone start on the battlefield. In play, battlefield records a reserve arriving or a unit disembarking.',
    {
      unitKey: 'A unit key from players[].units[].key.',
      formation: 'battlefield, strategic-reserves, deep-strike, or embarked.',
      transportKey: 'With embarked, the transport’s unit key.',
      ...PLAYER_FIELD,
    },
  ),
  command('set-first-turn', 'First turn step: who won the roll-off to go first.', { firstPlayerId: 'That side’s player id.' }),
  command('begin-battle', 'Starts the first Command phase once next.begin.refusal is null.', {
    firstPlayerId: 'Who takes the first turn, as set-first-turn recorded it.',
    attackerId: 'The attacker, as set-attacker recorded it.',
  }),
  command(
    'settle-opponent-turn',
    "Closes next.settlement: what the named side's cards scored at the end of its opponent's turn. Record any points first with score-settlement and that round, then send this.",
  ),
  drawSecondaries,
  command('acknowledge-draw', 'Command phase: the tactical side has read its newly drawn cards.', PLAYER_FIELD),
  command('adjust-cp', 'Command points outside the automatic Command phase gain, such as the one extra CP a round.', {
    delta: 'Whole CP to add (positive) or remove (negative).',
    ...PLAYER_FIELD,
  }),
  command('use-stratagem', 'Spends CP on a stratagem in its phase; next.stratagems lists those usable now.', {
    key: 'The stratagem key from players[].stratagems[].key.',
    cp: 'What it cost this time, when the board changed its listed cost.',
    ...PLAYER_FIELD,
  }),
  command('request-advance', 'Asks to end the phase when cards score now (next.scoringDue): opens scoring.', PLAYER_FIELD),
  command('score-settlement', 'Records what cards scored at this moment, which also completes the scoring review.', {
    scores:
      'One entry per card that scored: {category: "primary", delta} or {category: "secondary", key, delta, status: "achieved" when the card is completed}.',
    round: "With a pending settlement, its round: the previous turn's points belong to it.",
    ...PLAYER_FIELD,
  }),
  command('acknowledge-scoring', 'Completes the scoring review when nothing scored.', PLAYER_FIELD),
  command('cancel-advance', 'Withdraws request-advance.', PLAYER_FIELD),
  command('advance', 'Ends the current phase; from the end phase, passes the turn.', PLAYER_FIELD),
  command('resolve-tactical-hand', 'End of turn, tactical sides: discards active cards, optionally for 1 CP.', {
    keys: 'Secondary keys to discard.',
    gainCp: 'Take 1 CP for the discard (once a round).',
    ...PLAYER_FIELD,
  }),
  command('set-secondary-status', 'Changes a secondary card’s status: achieved, discarded, returned or active.', {
    key: 'The secondary key.',
    status: 'The new status.',
    ...PLAYER_FIELD,
  }),
  command('score', 'A side’s primary or secondary VP with no card to name, mostly for manual battles.', {
    category: 'primary or secondary.',
    delta: 'Whole VP to add or remove.',
    ...PLAYER_FIELD,
  }),
  command('score-secondary', 'Adds or removes VP on one named secondary outside a scoring moment.', {
    key: 'The secondary key.',
    delta: 'Whole VP to add or remove.',
    ...PLAYER_FIELD,
  }),
  command('correct-player', 'Corrects a total that was recorded wrong, without undoing later commands.', {
    playerId: 'The seat to correct.',
    resource: 'cp, primary or secondary.',
    delta: 'Whole points to add or remove.',
  }),
  command('wound-unit', 'Removes (negative) or restores (positive) whole models from a unit.', {
    unitKey: 'A unit key from players[].units[].key.',
    delta: 'Models to restore (positive) or remove (negative).',
    ...PLAYER_FIELD,
  }),
  command('damage-unit', 'Records wounds lost or healed across a unit whose models share one wounds characteristic.', {
    unitKey: 'A unit key from players[].units[].key.',
    delta: 'Wounds healed (positive) or lost (negative).',
    ...PLAYER_FIELD,
  }),
  command('set-unit', 'Marks a unit destroyed, or brings it back.', {
    unitKey: 'A unit key from players[].units[].key.',
    destroyed: 'Whether the unit is destroyed.',
    ...PLAYER_FIELD,
  }),
  command('reveal-secret', 'Reveals a side’s secret mission.', PLAYER_FIELD),
  command('add-note', 'Adds a note, such as a rules call, to the battle log. Anyone who can watch the battle reads it.', {
    text: 'The note.',
  }),
  command('pause-clock', 'Pauses the shared battle clock.'),
  command('resume-clock', 'Resumes the shared battle clock.'),
  command('switch-clock', 'Hands the chess clock to a side, such as for a reaction in the other side’s turn, until the phase ends.', {
    side: 'The side index, 0 or 1, from players[].side.',
  }),
  command('end-battle', 'Ends the battle early by concession; a full battle ends itself after the last turn.', {
    reason: 'conceded.',
    concededBy: 'The conceding player id.',
  }),
  command('reopen-battle', 'Reopens a finished battle to correct it.'),
  command('undo', 'Takes back the latest standing command. Use it instead of recording the opposite.', {
    target: 'The seq to take back: undoable from get_my_battle.',
  }),
])

/** The kinds this file builds; every other kind is the domain's own shape and passes through `commandSchema`. */
type Assembled = z.output<typeof configureBattle | typeof attachSavedRoster | typeof setSecondaries | typeof drawSecondaries>
type Submitted = z.infer<typeof submitSchema>['command']

/** Every army on the seat's side, with the stratagems its detachments bring, and the core cards the snapshot holds. */
async function sidePool(view: BattleView, side: number) {
  const armies = await Promise.all(
    view.players
      .filter((player) => player.side === side && player.roster?.built)
      .map(async ({ roster }) => {
        const built = roster!.built!
        const detachments = builtDetachments(built).map((detachment) => detachment.name)
        const data = await app().battleDetachmentDataFor(built.catalogueId)
        return { detachments, rules: data && selectedBattleDetachmentData(data, detachments) }
      }),
  )
  const core = armies.find((army) => army.rules)?.rules?.core ?? []
  return sideStratagems(
    armies.map((army) => ({ detachments: army.detachments, stratagems: army.rules?.stratagems ?? [] })),
    core,
  )
}

/** The set-prep the battle page writes for a side, built from this battle's rules rather than a device's references. */
async function missionCards(
  owner: string,
  token: string,
  submitted: z.output<typeof setSecondaries>,
  rules: LoadedRules,
): Promise<Command> {
  const { screen, state } = await app().service.seatedBattle(token, owner, rules)
  const seat = state.players.find((player) => player.id === (submitted.playerId ?? owner))
  if (!seat) throw new Response('that player is not in this battle', { status: 400 })
  const captain = sideCaptain(state, seat.side)
  const missionId = screen.missions.find((entry) => entry.side === seat.side)?.mission?.id
  const primary = rules.primaries.find((card) => card.key === missionId)
  const deck = rules.secondaries.map(asSecondary)
  if (isKotcLimit(state.settings.limit) && submitted.mode === 'fixed')
    throw new Response('King of the Colosseum plays tactical secondaries', { status: 400 })
  const fixed = submitted.mode === 'fixed' ? (submitted.fixed ?? []) : []
  const unknown = fixed.find((key) => !deck.some((card) => card.key === key))
  if (unknown) throw new Response(`${unknown} is not a secondary card; use a key from next.secondaryOptions`, { status: 400 })
  // The battle page offers only cards that score fixed, and begin-battle refuses a fixed side without its two.
  const tacticalOnly = fixed.find((key) => !deck.find((card) => card.key === key)!.awards?.some((award) => award.mode === 'fixed'))
  if (tacticalOnly)
    throw new Response(`${tacticalOnly} cannot be taken fixed; use a key from next.secondaryOptions where fixed is true`, { status: 400 })
  if (submitted.mode === 'fixed' && new Set(fixed).size !== FIXED_SECONDARIES)
    throw new Response(`fixed secondaries take ${FIXED_SECONDARIES} different cards`, { status: 400 })
  return {
    kind: 'set-prep',
    playerId: captain.id,
    stratagems: await sidePool(screen.view, seat.side),
    secondaries: fixed.map((key) => deck.find((card) => card.key === key)!),
    secondaryDeck: deck,
    primary: primary ? asSecondary(primary) : null,
    secondaryMode: submitted.mode,
  }
}

/** The site's command for what an agent sent, filling in what the page would. */
export async function agentBattleCommand(owner: string, token: string, sent: object): Promise<Submitted> {
  const submitted = sent as Assembled
  if (submitted.kind === 'attach-saved-roster') return submitted
  const rules = await app().rulesFor()
  if (submitted.kind === 'set-secondaries') {
    if (!rules) throw new Response('Mission cards are unavailable right now.', { status: 503 })
    return missionCards(owner, token, submitted, rules)
  }
  if (submitted.kind === 'configure-battle') {
    const { settings } = (await app().service.seatedBattle(token, owner, rules)).state
    // The same follow-on changes the setup page makes: a twist belongs to its pack, and a manual battle has no pack, twist or layout.
    const manual = submitted.manual ?? settings.manual ?? false
    const missionPackId = manual
      ? null
      : submitted.missionPackId !== undefined
        ? submitted.missionPackId
        : settings.manual && rules
          ? (gameReferencesFor(rules).packs[0]?.id ?? null)
          : settings.missionPackId
    return commandSchema.parse({
      kind: 'configure-battle',
      limit: submitted.limit !== undefined ? submitted.limit : settings.sizeFromRosters ? null : settings.limit,
      missionPackId,
      terrainLayoutId: manual ? null : settings.terrainLayoutId,
      twistId: manual
        ? null
        : submitted.twistId !== undefined
          ? submitted.twistId
          : missionPackId === settings.missionPackId
            ? settings.twistId
            : null,
      teamBattle: settings.teamBattle,
      playerCount: settings.playerCount,
      armyPoints: settings.armyPoints ?? null,
      ...(settings.sharedArmyPoints ? { sharedArmyPoints: true } : {}),
      sizeFromSides: true,
      clockLimitMinutes: settings.clockLimitMinutes ?? null,
      ...(manual ? { manual: true } : {}),
    })
  }
  if (submitted.kind === 'draw-secondaries') {
    const { state } = await app().service.seatedBattle(token, owner, rules)
    const seat = state.players.find((player) => player.id === (submitted.playerId ?? owner))
    if (!seat) throw new Response('that player is not in this battle', { status: 400 })
    const captain = sideCaptain(state, seat.side)
    const deck = undrawnSecondaries(captain)
    const owed = Math.max(1, Math.min(secondaryDrawTarget(captain) - captain.secondariesDrawnThisTurn.length, deck.length))
    // Without keys the service deals the cards at random under the battle lock; these only say how many.
    const cards = submitted.keys
      ? submitted.keys.map((key) => deck.find((card) => card.key === key) ?? { key, name: key })
      : deck.slice(0, owed)
    if (!cards.length) throw new Response('there are no secondary cards left to draw', { status: 400 })
    return {
      kind: 'draw-secondaries',
      secondaries: cards.map(asSecondary),
      ...(submitted.keys ? { selected: true as const } : {}),
      ...(submitted.playerId ? { playerId: submitted.playerId } : {}),
    }
  }
  return commandSchema.parse(sent)
}

const names = (view: BattleView) => new Map(view.players.map((player) => [player.id, player.name]))

/** A setup step in the order the battle page and the rules set the table. */
function setupSteps(
  view: BattleView,
  state: BattleState,
  screen: { missions: { side: number; mission: { id: string; name: string } | null }[] },
) {
  const named = names(view)
  const sides = [...new Set(view.players.map((player) => player.side))].toSorted((left, right) => left - right)
  const captains = sides.map((side) => sideCaptain(state, side))
  const manual = view.settings.manual === true
  const step = (name: string, done: boolean, send: string, extra: Record<string, unknown> = {}) => ({ step: name, done, send, ...extra })
  const cardsReady = (captain: (typeof captains)[number]) => {
    const missionId = screen.missions.find((entry) => entry.side === captain.side)?.mission?.id
    if (!missionId) return true
    if (captain.primaryCard?.key !== missionId || !captain.secondaryDeck?.length) return false
    return captain.secondaryMode !== 'fixed' || captain.secondaries.length === FIXED_SECONDARIES
  }
  return [
    step(
      'Format',
      (view.settings.limit !== null || Boolean(view.settings.sizeFromRosters)) && (manual || Boolean(view.settings.missionPackId)),
      'configure-battle with limit and missionPackId (or manual: true)',
      { limit: view.settings.limit, missionPackId: view.settings.missionPackId, manual },
    ),
    step(
      'Armies',
      view.players.every((player) => player.roster),
      'attach-saved-roster for each seat, then set-painted if battle ready',
      {
        waitingFor: view.players.filter((player) => !player.roster).map(({ id, name, automated }) => ({ id, name, automated })),
      },
    ),
    step(
      'Warlord',
      view.players.every((player) => player.warlordChoices.length <= 1 || player.warlord),
      'set-side-warlord for an allied side',
    ),
    ...(manual
      ? []
      : [
          step(
            'Mission',
            view.players.every((player) => player.dispositionChoices.length <= 1 || player.disposition),
            'set-side-disposition for an allied side with several dispositions',
            {
              missions: screen.missions.map(({ side, mission }) => ({ side, mission: mission && { id: mission.id, name: mission.name } })),
            },
          ),
          step('Battlefield', Boolean(view.deploymentId), 'set-battlefield with one of battlefields', { deploymentId: view.deploymentId }),
          step('Defender', Boolean(view.attackerId), 'set-attacker after the roll-off', {
            attacker: view.attackerId && named.get(view.attackerId),
          }),
          step(
            'Secondaries',
            view.players.every((player) => player.roster) && captains.every(cardsReady),
            'set-secondaries for each side',
            {
              sides: captains.map((captain) => ({
                side: captain.side,
                playerId: captain.id,
                mode: captain.secondaryMode,
                ready: cardsReady(captain),
              })),
            },
          ),
          step('Reserves', true, 'optional: set-unit-formation for units not starting on the battlefield'),
          step('Deploy', true, 'nothing to record: place the units at the table, defender first'),
        ]),
    step('First turn', Boolean(view.firstPlayerId), 'set-first-turn after the roll-off', {
      first: view.firstPlayerId && named.get(view.firstPlayerId),
    }),
  ]
}

/** What the battlefield step offers: the layouts printed for this matchup, on a deployment the missions allow. */
function battlefields(view: BattleView, rules: LoadedRules, missions: { mission: { deploymentIds: string[] } | null }[]) {
  const kotc = isKotcLimit(view.settings.limit)
  const dispositions = [...new Set(view.players.map((player) => player.side))].flatMap(
    (side) => view.players.find((player) => player.side === side)?.disposition ?? [],
  )
  const matchups = new Set(kotc ? [KOTC_MATCHUP_ID] : terrainMatchupIds(dispositions))
  const allowed = missions.flatMap(({ mission }) => mission?.deploymentIds ?? [])
  return rules.terrainLayouts.flatMap((terrain) => {
    const deployment = rules.deployments.find((candidate) => candidate.id === terrain.deploymentId)
    if (!deployment || !terrain.geometry || !matchups.has(terrain.matchupId)) return []
    if (!kotc && allowed.length && !allowed.includes(deployment.id)) return []
    return [{ patternId: deployment.id, deployment: deployment.name, terrainLayoutId: terrain.id, terrain: terrain.name }]
  })
}

/** Each probe's refusal, so the agent reads what the domain accepts now rather than guessing. */
function probes(state: BattleState, by: string, commands: Command[]) {
  return commands.map((probe) => ({ kind: probe.kind, refusal: validate(state, by, probe) }))
}

/**
 * What the battle expects next, read from the fold and `validate`, the same authority
 * that accepts or refuses each command; nothing here is stored.
 */
export function battleNext(
  owner: string,
  screen: { view: BattleView; missions: { side: number; mission: { id: string; name: string; deploymentIds: string[] } | null }[] },
  state: BattleState,
  rules: LoadedRules | null,
) {
  const { view } = screen
  const named = names(view)
  if (state.status === 'finished') return { stage: 'finished' as const, result: view.result, undoable: view.undoable }
  if (state.status === 'setup') {
    const firstPlayerId = state.firstPlayerId ?? owner
    const begin: Command = { kind: 'begin-battle', firstPlayerId, ...(state.attackerId ? { attackerId: state.attackerId } : {}) }
    // The page also waits for the roll-offs the domain leaves to the table.
    const refusal =
      [
        validate(state, owner, begin),
        rules && setupReferenceError(state, rules)?.message,
        !state.attackerId && !state.settings.manual && 'record the attacker with set-attacker',
        !state.firstPlayerId && 'record who takes the first turn with set-first-turn',
      ].find((reason): reason is string => typeof reason === 'string') ?? null
    const ready = view.players.every((player) => player.roster)
    return {
      stage: 'setup' as const,
      steps: setupSteps(view, state, screen),
      ...(ready && rules && !view.settings.manual
        ? {
            battlefields: battlefields(view, rules, screen.missions),
            secondaryOptions: rules.secondaries.map((card) => ({
              key: card.key,
              name: card.name,
              fixed: card.awards.some((award) => award.mode === 'fixed'),
            })),
          }
        : {}),
      begin: { send: begin, refusal },
    }
  }
  const active = state.activePlayerId ? sideCaptain(state, state.players.find((player) => player.id === state.activePlayerId)!.side) : null
  const playerId = active?.id
  const settlement = state.pendingSettlement
  const owed =
    active && sideOwes(state, active) === 'cards'
      ? undrawnSecondaries(active).slice(0, secondaryDrawTarget(active) - active.secondariesDrawnThisTurn.length)
      : []
  const commands = probes(
    state,
    owner,
    [
      settlement ? ({ kind: 'settle-opponent-turn' } as const) : null,
      owed.length ? ({ kind: 'draw-secondaries', secondaries: owed.map(asSecondary), playerId } as const) : null,
      { kind: 'acknowledge-draw', playerId } as const,
      { kind: 'request-advance', playerId } as const,
      { kind: 'acknowledge-scoring', playerId } as const,
      { kind: 'advance', playerId } as const,
    ].filter((probe): probe is NonNullable<typeof probe> => probe !== null),
  )
  return {
    stage: 'playing' as const,
    round: state.round,
    phase: state.phase,
    activePlayer: active && {
      id: active.id,
      name: named.get(active.id),
      you: view.players.some((player) => player.isViewer && player.side === active.side),
    },
    settlement: settlement && { playerId: settlement.playerId, name: named.get(settlement.playerId), round: settlement.round },
    // Raw state holds the opponent's unrevealed secret mission; the view hides it, so this must too.
    scoringDue: active
      ? scoringDue(state, active)
          .filter((card) => mayNameCard(state, owner, active, card.key))
          .map(({ key, name, category }) => ({ key, name, category }))
      : [],
    allowed: commands.filter((probe) => !probe.refusal).map((probe) => probe.kind),
    advanceRefusal: commands.find((probe) => probe.kind === 'advance')?.refusal ?? null,
    stratagems: view.players
      .filter((player) => player.stratagems.length)
      .map((player) => ({
        playerId: player.id,
        name: player.name,
        usable: player.stratagems
          .filter((stratagem) => !stratagem.refusal)
          .map(({ key, name, cp, detachment }) => ({ key, name, cp, ...(detachment ? { detachment } : {}) })),
      })),
    undoable: view.undoable,
  }
}

const BATTLE_HELP =
  'next says what the battle expects: in setup, each step in table order with done and the command that answers it, the battlefields and secondary cards on offer, and begin.refusal until begin-battle would be accepted; in play, the round, phase, active player, a pending settlement of the previous turn, cards scoring now, the turn commands allowed now and why advance is refused, stratagems usable now per side, and the undoable seq.'

const REPORT_PAGE = 200

export function registerBattleTools(server: AgentTools, userId: string | null) {
  const owner = () => {
    if (!userId) throw new Response('Sign in to use this tool.', { status: 401 })
    return userId
  }

  server.registerTool(
    'list_my_opponents',
    {
      title: 'List who I can play',
      description:
        'Lists the friends the signed-in player can seat in create_battle, by id. Everyone at the table needs an account: someone without one signs up and becomes a friend first. To play a game alone, create_battle takes bothSides instead. Requires mcp:read.',
      inputSchema: {},
      annotations: READ_ONLY_TOOL,
    },
    () =>
      resultOf(async () => ({
        opponents: (await app().service.socialService.opponents(owner())).map(({ id, name }) => ({ id, name })),
      })),
  )
  server.registerTool(
    'create_battle',
    {
      title: 'Create a battle',
      description:
        "Creates a battle in setup and returns its token. With nobody named it starts a draft with only you at the table, reusing your untouched draft with the same mission pack, and returns joinUrl: anyone with an account who opens it joins the open place, and the draft becomes a battle once every place is filled and every army chosen. opponentId seats one opponent from list_my_opponents for a duel; opponentIds seats one or two, and allyId seats a friend on your side, for a 2v1 or doubles. bothSides: true starts a duel you play alone instead: you hold both places and choose both armies from your own rosters, and it stays out of your record and the leaderboard. limit is the battle size in points (1000, 2000, 3000, or 600 for King of the Colosseum); omit it to take the size from the rosters, as a draft always does. missionPackId is a mission pack id from list_reference. casual: true plays it outside a tournament both players are entered in. manual: true tracks by hand without mission cards, stratagems or CP automation. groupToken counts it for a group both players are in, and fixture names that group's league fixture. Then set it up with submit_battle_action, following get_my_battle's next. Requires mcp:write.",
      inputSchema: createBattleSchema.safeExtend({
        bothSides: z.boolean().optional().describe('Play every side yourself, choosing every army from your own rosters.'),
      }),
      annotations: WRITE,
    },
    (data) =>
      resultOf(async () => {
        if (data.bothSides) {
          if (data.opponentId || data.opponentIds || data.allyId || data.groupToken || data.limit || data.manual)
            throw new Response('a battle played alone names nobody and takes its size from the lists', { status: 400 })
          const { token } = await startDraftBattle(owner(), data.missionPackId)
          await app().service.playBothSides(token, owner())
          return { token, url: `/battles/${encodeURIComponent(token)}` }
        }
        if (!data.opponentId && !data.opponentIds && !data.allyId && !data.groupToken) {
          // A draft's size follows its lists and its tracking is answered in setup, so nothing here would be kept.
          if (data.limit || data.manual)
            throw new Response('a battle started alone takes its size from the lists; choose manual tracking in setup', { status: 400 })
          const { token } = await startDraftBattle(owner(), data.missionPackId)
          const { invite } = await app().service.shareBattle(token, owner())
          return { token, draft: true, url: `/battles/${encodeURIComponent(token)}`, joinUrl: battleInvitePath(invite) }
        }
        const { token } = await productActions.createBattle(owner(), data)
        return { token, url: `/battles/${encodeURIComponent(token)}` }
      }),
  )
  server.registerTool(
    'get_my_battle',
    {
      title: 'Read one of my battles',
      description: `Returns the signed-in player's seated view of a battle (battle) and what it expects next (next). ${BATTLE_HELP} Requires mcp:read.`,
      inputSchema: tokenSchema.shape,
      annotations: READ_ONLY_TOOL,
    },
    ({ token }) =>
      resultOf(async () => {
        const instance = app()
        const rules = await instance.rulesFor()
        const { screen, state } = await instance.service.seatedBattle(token, owner(), rules)
        // A finished battle's timeline repeats its whole report unpaged; get_my_battle_report pages it.
        const { timeline: _timeline, ...battle } = screen
        return { battle, next: battleNext(owner(), screen, state, rules) }
      }),
  )
  server.registerTool(
    'submit_battle_action',
    {
      title: 'Record a battle action',
      description:
        "Appends one command to a battle's log, only when expectedSeq equals the battle's current seq from get_my_battle. The answer's result.outcome is appended, stale (someone recorded first: read the battle again) or refused with the reason. Any seated player may record for any seat with playerId, as at a shared table. Each command kind says when it is used; follow get_my_battle's next for the order. Requires mcp:write.",
      inputSchema: { token: submitSchema.shape.token, expectedSeq: submitSchema.shape.expectedSeq, command: agentCommandSchema },
      annotations: WRITE,
    },
    ({ token, expectedSeq, command: submitted }) =>
      resultOf(async () =>
        submitBattleCommand(owner(), { token, expectedSeq, command: await agentBattleCommand(owner(), token, submitted) }),
      ),
  )
  server.registerTool(
    'get_my_battle_report',
    {
      title: 'Read my battle report',
      description: `Returns a battle's log as its report reads it, oldest first and ${REPORT_PAGE} entries a page: each entry's seq, round, phase, the player id that recorded it (by) and a sentence saying what happened. Pass nextAfter as after for the next page. Totals and the result are in get_my_battle. Requires mcp:read.`,
      inputSchema: {
        token: tokenSchema.shape.token,
        after: z.number().int().min(0).optional().describe('nextAfter from the previous page.'),
      },
      annotations: READ_ONLY_TOOL,
    },
    ({ token, after = 0 }) =>
      resultOf(async () => {
        const instance = app()
        const entries = (await instance.service.report(token, owner(), await instance.rulesFor())).filter((entry) => entry.seq > after)
        const page = entries.slice(0, REPORT_PAGE)
        return {
          entries: page.map(({ seq, round, phase, by, text }) => ({ seq, round, phase, by, text })),
          nextAfter: entries.length > REPORT_PAGE ? page.at(-1)!.seq : null,
        }
      }),
  )
  server.registerTool(
    'delete_battle',
    {
      title: 'Delete my battle',
      description:
        'Permanently deletes a battle the signed-in player created, for every player in it, with its result. Only the creator can. Confirm with the player first. Requires mcp:write.',
      inputSchema: tokenSchema.shape,
      annotations: WRITE,
    },
    ({ token }) =>
      resultOf(async () => {
        await productActions.deleteBattle(owner(), { token })
        return { deleted: token }
      }),
  )
}
