import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { deleteBattle } from '../../server/functions'
import { battleQuery, battlesQuery, deploymentsQuery, detachmentRulesQuery, gameReferencesQuery } from '../queries'
import { primaryCards, secondaryCards } from '../missionDeck'
import { appliesInMode } from '../missionText'
import { errorMessage } from '../queryClient'
import { armyRulesRequest } from '../sideRules'
import { type Side, type SideMission, sideName, sides } from '../sides'
import type { Command } from '../../core/battle'
import type { BattleView } from '../../core/battleView'
import { BattleMenu } from './battle/BattleMenu'
import { DrawDialog, type WhenDrawn } from './battle/DrawDialog'
import { DiscardSecondaryDialog } from './battle/DiscardSecondaryDialog'
import type { Award, ReferenceCard, StratagemText } from './battle/MissionCards'
import { Scoreboard } from './battle/Scoreboard'
import { turnPrompt } from '../scoring'
import { dueForAdvance, dueFromTheirTurn, ScoringDialog } from './battle/ScoringDialog'
import { SidePanel } from './battle/SidePanel'
import { HEADING } from './battle/tints'
import { TurnControl } from './battle/TurnControl'
import { TwistName } from './MissionTwist'
import { Report, type ReportPlayer } from './Report'

type Props = {
  view: BattleView
  /** Each side's own mission, derived from both armies' dispositions, so it is the same on both devices. */
  missions: { side: number; mission: SideMission | null }[]
  send: (command: Command) => void
  pending: boolean
  problem: string | null
}

/** Narrow screens cannot hold three columns, so they hold one at a time. */
const VIEWS = ['yours', 'battle', 'theirs'] as const
type Focus = (typeof VIEWS)[number]
type ScoringContext = Pick<BattleView, 'seq' | 'round' | 'phase' | 'activePlayerId'>
type DiscardContext = Pick<BattleView, 'round' | 'phase' | 'activePlayerId'> & { keys: string[] }

/**
 * The live battle, laid out as the table is: a side, the battle, the other side.
 *
 * Both formats use this one arrangement. A 2v1 does not add a third column — the
 * allied pair is one side, because the rules make it one: they share the turn, the
 * command points, the cards and the score, and only the armies are separate.
 */
export function Tracker({ view, missions, send, pending, problem }: Props) {
  const [focus, setFocus] = useState<Focus>('yours')
  const [scoring, setScoring] = useState<ScoringContext | null>(null)
  const [discarding, setDiscarding] = useState<DiscardContext | null>(null)
  // Which turn the draw is open for, and every turn already taken past it. A set
  // rather than the one latest turn, so rewinding across several turn boundaries
  // and back still recognises a turn whose draw was dismissed long before the most
  // recent one — otherwise it reads as never drawn and autofills instead of pausing.
  const [drawTurn, setDrawTurn] = useState<string | null>(null)
  const [drawnForTurns, setDrawnForTurns] = useState<ReadonlySet<string>>(new Set())
  const [drawPaused, setDrawPaused] = useState(false)
  const table = sides(view, missions)
  const yours = table.find((side) => side.isViewer)
  const active = table.find((side) => side.isActive)
  const ruleRequests = table.flatMap((side) =>
    side.armies.flatMap((army) => {
      const request = armyRulesRequest(army.roster)
      return request.catalogueId ? [{ side: side.index, ...request }] : []
    }),
  )
  const ruleResults = useQueries({
    queries: ruleRequests.map((request) => detachmentRulesQuery(request.catalogueId, request.detachmentNames)),
  })
  const { data: deployments } = useQuery(deploymentsQuery())
  const referencesQuery = useQuery(gameReferencesQuery())
  const references = referencesQuery.data
  // What a card pays is read out of the references now, not out of a side's own rules,
  // so "do we know what the cards say yet" has to watch this query too. An instance
  // with nothing synced answers null and is not waiting on anything; a request still
  // in flight or one that failed is, and neither may be read as a card that pays nothing.
  const deckUnknown = referencesQuery.isPending || referencesQuery.isError
  const deployment = deployments?.find((entry) => entry.id === view.deploymentId)
  const missionPack = references?.packs.find((entry) => entry.id === view.settings.missionPackId)
  const twist = missionPack?.twists.find((entry) => entry.id === view.settings.twistId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => deleteBattle({ data: { token: view.token } }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: battleQuery(view.token).queryKey })
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      await navigate({ to: '/battles' })
    },
  })
  const rulesFor = (side: Side) =>
    ruleResults.flatMap((result, index) => (ruleRequests[index]?.side === side.index && result.data ? [result.data] : []))
  // The cards are the instance's, not a side's: one deck, read the same way for both.
  const deck = [...primaryCards(references), ...secondaryCards(references)]
  const awardsFor = (key: string, mode?: string): Award[] =>
    (deck.find((card) => card.key === key)?.awards ?? []).filter((award) => appliesInMode(award, mode))
  const referenceFor = (key: string): ReferenceCard | undefined => deck.find((card) => card.key === key)
  const writtenFor = (side: Side, key: string): StratagemText | undefined => {
    const rules = rulesFor(side).find((candidate) => candidate.written.some((entry) => entry.key === key))
    const written = rules?.written.find((entry) => entry.key === key)
    return written ? { ...written, keywordRules: rules?.keywordRules ?? [] } : undefined
  }
  const whenDrawnFor = (key: string): WhenDrawn | undefined =>
    secondaryCards(references).find((card) => card.key === key)?.whenDrawn ?? undefined
  const coreKeysFor = (side: Side) => new Set(rulesFor(side).flatMap((rules) => rules.core.map((stratagem) => stratagem.key)))
  // Seats are ordered by side, so both devices agree on which player is which colour.
  const reportPlayers: ReportPlayer[] = view.players.map((player) => ({
    id: player.id,
    name: player.name,
    className: player.side === 0 ? 'text-side-a' : 'text-side-b',
  }))
  const finished = view.status === 'finished'
  // A battle whose second seat is still empty draws one side, not a gap where the other goes.
  const oneSided = table.length < 2
  // A side's own mission can state a lower ceiling than the conventional one, and the
  // two sides need not be playing the same mission, so this is asked of each side.
  const guidesFor = (side: Side) => ({
    primary: side.mission?.gameCap ?? view.guides.primary,
    secondary: side.mission?.secondaryGameCap ?? view.guides.secondary,
  })
  /** Which panel a narrow screen is showing, in the order the columns sit on a wide one. */
  const shown = (side: Side) => (side.isViewer ? 'yours' : 'theirs')

  // Only what the card itself says pays out at this moment, so the ask arrives with the phase that ends.
  const due = active && !finished ? dueForAdvance(view, active, awardsFor) : []
  const activeNeedsRules = Boolean(active?.primaryCard || active?.secondaries.some((card) => card.status === 'active'))
  const activeRuleResults = ruleResults.filter((_, index) => ruleRequests[index]?.side === active?.index)
  // The only thing that still holds the turn back is not knowing what the cards say.
  // What the active side still owes is shown as a reminder: one person refereeing the
  // table can do every one of those things, and refusing them the turn only stopped
  // the game they were running.
  const blockReason =
    (activeNeedsRules && !activeRuleResults.some((result) => result.data) && activeRuleResults.some((result) => result.isPending)) ||
    (activeNeedsRules && deckUnknown)
      ? 'Loading the active side’s rules…'
      : null
  const advanceBlocked = Boolean(blockReason)
  const advance = () => {
    if (advanceBlocked || !active) return
    if (due.length) {
      setScoring({ seq: view.seq, round: view.round, phase: view.phase, activePlayerId: view.activePlayerId })
      return
    }
    const discardable = discardableSecondaries(active)
    if (view.phase === 'end' && discardable.length) {
      setDiscarding({ round: view.round, phase: view.phase, activePlayerId: view.activePlayerId, keys: discardable })
      return
    }
    send({ kind: 'advance', playerId: active.captain.id })
  }
  const scoringCurrent =
    scoring?.seq === view.seq &&
    scoring.round === view.round &&
    scoring.phase === view.phase &&
    scoring.activePlayerId === view.activePlayerId
  // Shared cards are written by one seat, the way prep is, so a 2v1 cannot draw twice
  // or score its one hand twice from two devices.
  const keeper = yours?.writer.id === view.viewerId
  /**
   * The active side, when this device is the one that deals its hand.
   *
   * A side with players on it is dealt by the one seat that writes for it, so two
   * devices in a shared battle never deal the same hand twice. A side of practice
   * opponents has no such seat, so the table facing it deals instead.
   */
  const dealing = active && (active.isViewer ? keeper : active.automated) ? active : undefined
  const settlementRound = view.settlementRound
  const settlementSide = table.find((side) => side.captain.id === view.settlementPlayerId)
  // Concluding that nothing private remains is the side's own call. A practice
  // opponent cannot make it, so the table playing that side makes it instead.
  const settlementOwner = settlementSide?.writer.id === view.viewerId || Boolean(settlementSide?.automated)
  const settlementRuleResults = ruleResults.filter((_, index) => ruleRequests[index]?.side === settlementSide?.index)
  const settlementRulesPending = settlementRuleResults.some((result) => result.isPending) || deckUnknown
  const owedCards =
    settlementRound !== null && settlementSide && !finished
      ? dueFromTheirTurn(settlementRound, settlementSide, awardsFor, heldKeys(settlementSide))
      : []
  useEffect(() => {
    // A helper's view may redact a hidden mission that is still owed. Only the owner
    // may conclude that an apparently empty settlement has no private work behind it.
    if (!settlementOwner || settlementRound === null || settlementRulesPending || owedCards.length || pending) return
    send({ kind: 'settle-opponent-turn' })
  }, [owedCards.length, pending, send, settlementOwner, settlementRound, settlementRulesPending])
  // Two tactical cards are dealt at the top of your own turn, and only once for it.
  const turnKey = `${view.round}-${view.activePlayerId ?? ''}`
  const owedDraw =
    !finished &&
    dealing &&
    dealing.secondaryMode === 'tactical' &&
    view.phase === 'command' &&
    dealing.secondariesDrawnThisTurn < 2 &&
    dealing.remainingSecondaries.length > 0
  // Latched, because the turn stops owing a draw the moment it is dealt and the player
  // still has to see what they drew and whether a card may go back.
  useEffect(() => {
    if (!owedDraw) return
    const reopening = drawnForTurns.has(turnKey)
    setDrawPaused(reopening)
    // Forgotten rather than left marked drawn, so the prompt is free to show again;
    // taking the turn re-adds it below once the reopened draw is done with.
    if (reopening) {
      setDrawnForTurns((current) => {
        const next = new Set(current)
        next.delete(turnKey)
        return next
      })
    }
    setDrawTurn(turnKey)
  }, [owedDraw, drawnForTurns, turnKey])
  const prompt =
    settlementRound !== null ? (owedCards.length ? 'owed' : null) : turnPrompt(0, drawTurn === turnKey && !drawnForTurns.has(turnKey))

  return (
    <main className={`w-full space-y-3 px-3 lg:pb-8 ${finished ? 'pb-8' : 'pb-32'}`}>
      <Scoreboard view={view} sides={table} outcome={finished ? outcome(table, view) : null} />

      {/* Nobody across the table yet means neither a tab nor a column for them. */}
      <Tabs value={focus} onValueChange={(value) => setFocus(value as Focus)} className="lg:hidden">
        <TabsList className={`grid w-full ${oneSided ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <TabsTrigger value="yours">Your side</TabsTrigger>
          <TabsTrigger value="battle">Battle</TabsTrigger>
          {oneSided ? null : <TabsTrigger value="theirs">Opponent</TabsTrigger>}
        </TabsList>
      </Tabs>

      <div
        className={`mx-auto grid items-start gap-3 ${
          oneSided
            ? 'max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)]'
            : 'max-w-7xl lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)_minmax(0,1fr)]'
        }`}
      >
        {table.map((side) => (
          <SidePanel
            key={side.index}
            view={view}
            side={side}
            coreKeys={coreKeysFor(side)}
            pending={pending}
            send={send}
            awardsFor={awardsFor}
            referenceFor={referenceFor}
            writtenFor={writtenFor}
            guides={guidesFor(side)}
            className={`${focus === shown(side) ? '' : 'hidden lg:block'} ${side.index === 0 ? 'lg:col-start-1' : 'lg:col-start-3'} lg:row-start-1`}
          />
        ))}

        <div className="min-w-0 space-y-3 lg:col-start-2 lg:row-start-1">
          {/*
           * One instance, moved by CSS rather than rendered twice: ending a phase is the
           * most-pressed control in the game, so on a phone it sits under the thumb all
           * game instead of behind the tab that holds the rest of the battle.
           */}
          {finished ? null : (
            <TurnControl
              view={view}
              send={send}
              pending={pending}
              onAdvance={advance}
              blockReason={blockReason}
              note={view.advancePrompt}
              /*
               * `mb-0` because the column spaces its children with a bottom margin, and
               * a margin on a fixed box sits between it and the edge it is pinned to —
               * which held the bar that far off the bottom of every phone and tablet.
               * At `lg` it is an ordinary box in the column again and takes the gap back.
               */
              className="fixed inset-x-0 bottom-0 z-40 mb-0 border-t border-edge bg-panel/98 px-3 py-2 backdrop-blur lg:static lg:mb-3 lg:rounded-lg lg:border lg:bg-panel lg:p-3 lg:backdrop-filter-none"
            />
          )}

          <section className={`space-y-3 rounded-lg border border-edge bg-panel p-3 ${focus === 'battle' ? '' : 'hidden lg:block'}`}>
            {finished ? (
              <p className="rounded-sm border border-edge bg-sunken p-3 text-center text-sm text-dim">
                {resultLabel(view) ?? 'The battle is over.'} Reopen it from the battle menu to keep playing.
              </p>
            ) : null}

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <Fact label="Mission" value={yours?.mission?.name ?? 'Matched play'} />
              <Fact label="Mission pack" value={missionPack?.name ?? 'Not chosen'} />
              <Fact
                label="Battlefield"
                value={deployment ? `${deployment.name} · ${deployment.objectives.length} objectives` : 'Not chosen'}
              />
              <Fact label="Attacker" value={view.players.find((player) => player.id === view.attackerId)?.name ?? 'Not chosen'} />
              <Fact label="Battle size" value={view.settings.limit ? `${view.settings.limit} points` : 'Legacy format'} />
              <Fact label="Format" value={formatName(table)} />
              {/*
               * A twist changes one rule for the whole battle, so it is not enough to
               * name it: the sentence it changes has to be readable from the table
               * without leaving the game to go and find the pack.
               */}
              {twist ? (
                <div className="min-w-0">
                  <dt className={HEADING}>Twist</dt>
                  <dd>
                    <TwistName twist={twist} />
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="border-t border-edge pt-3">
              <p className={HEADING}>Battle events</p>
              <Report token={view.token} open players={reportPlayers} />
            </div>

            {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
            {remove.error ? <p className="text-sm text-destructive">{errorMessage(remove.error)}</p> : null}

            {/*
             * Finishing, conceding, reopening and deleting, under the log rather than
             * beside the round. Each is rare and none is pressed mid-turn, and up there
             * it pushed the round and the phase off the centre of every screen to make
             * room for something nobody was reaching for.
             */}
            <div className="flex justify-end border-t border-edge pt-3">
              <BattleMenu
                finished={finished}
                canDelete={view.creatorId === view.viewerId}
                pending={pending || remove.isPending}
                onFinishEarly={() => send({ kind: 'end-battle', reason: 'finished-early' })}
                onConcede={() => send({ kind: 'end-battle', reason: 'conceded', concededBy: view.viewerId })}
                onReopen={() => send({ kind: 'reopen-battle' })}
                onDelete={() => remove.mutate()}
              />
            </div>
          </section>
        </div>
      </div>

      {scoringCurrent && active ? (
        <ScoringDialog
          side={active}
          due={due}
          moment={view.phase === 'end' ? 'end of turn' : `end of ${view.phase} phase`}
          confirmLabel={view.phase === 'end' ? 'Pass the turn' : 'End the phase'}
          pending={pending}
          send={send}
          referenceFor={referenceFor}
          round={view.round}
          onCancel={() => setScoring(null)}
          onDone={(completedSecondaryKeys) => {
            setScoring(null)
            const discardable = discardableSecondaries(active).filter((key) => !completedSecondaryKeys.includes(key))
            if (view.phase === 'end' && discardable.length) {
              setDiscarding({ round: view.round, phase: view.phase, activePlayerId: view.activePlayerId, keys: discardable })
            } else send({ kind: 'advance', playerId: active.captain.id })
          }}
        />
      ) : null}

      {prompt === 'owed' && settlementSide ? (
        <ScoringDialog
          side={settlementSide}
          due={owedCards}
          moment="end of their turn"
          confirmLabel="Take the turn"
          pending={pending}
          send={send}
          referenceFor={referenceFor}
          round={settlementRound ?? view.round}
          onDone={() => send({ kind: 'settle-opponent-turn' })}
        />
      ) : null}

      {discarding &&
      active &&
      discarding.round === view.round &&
      discarding.phase === view.phase &&
      discarding.activePlayerId === view.activePlayerId ? (
        <DiscardSecondaryDialog
          side={active}
          keys={discarding.keys}
          pending={pending}
          send={send}
          onDone={() => {
            setDiscarding(null)
            send({ kind: 'advance', playerId: active.captain.id })
          }}
        />
      ) : null}

      {prompt === 'draw' && dealing ? (
        <DrawDialog
          key={turnKey}
          side={dealing}
          round={view.round}
          undoable={view.undoable}
          confirmUndo={view.undoableDraw}
          initiallyPaused={drawPaused}
          pending={pending}
          send={send}
          referenceFor={referenceFor}
          whenDrawnFor={whenDrawnFor}
          onDone={() => {
            setDrawPaused(false)
            setDrawnForTurns((current) => new Set(current).add(turnKey))
          }}
        />
      ) : null}
    </main>
  )
}

const discardableSecondaries = (side: Side) =>
  side.secondaryMode === 'tactical'
    ? side.secondaries.filter((card) => !card.secret && card.status === 'active').map((card) => card.key)
    : []

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className={HEADING}>{label}</dt>
      <dd className="truncate text-bone" title={value}>
        {value}
      </dd>
    </div>
  )
}

/**
 * The shape of the table, and only that.
 *
 * A seat nobody signs in to does not change what is being played — a 2v1 with one in
 * it is a 2v1 — and the seat is already named after what it is, so saying "practice"
 * here was the same fact told twice.
 */
function formatName(table: Side[]) {
  return table
    .map((side) => side.armies.length)
    .toSorted((left, right) => right - left)
    .join('v')
}

function outcome(table: Side[], view: BattleView) {
  if (view.result?.reason === 'conceded') {
    const conceded = view.players.find((player) => player.id === view.result?.concededBy)?.side
    const winner = table.find((side) => side.index !== conceded)
    return winner ? `${sideName(winner)} win by concession` : 'Battle conceded'
  }
  const [first, second] = table.toSorted((left, right) => right.total - left.total)
  if (!first) return 'No result'
  if (!second) return `Final score ${first.total}`
  return first.total === second.total ? `Drawn at ${first.total}` : `${sideName(first)} win ${first.total}–${second.total}`
}

function resultLabel(view: BattleView) {
  if (!view.result) return null
  if (view.result.reason === 'conceded') {
    return `${view.players.find((player) => player.id === view.result?.concededBy)?.name ?? 'A player'} conceded.`
  }
  return view.result.reason === 'finished-early' ? 'Finished early.' : 'Played to the last round.'
}

/** The cards a side was holding, as keys, so a later hand can be told from this one. */
const heldKeys = (side: Side | undefined) => (side?.secondaries ?? []).filter((card) => card.status === 'active').map((card) => card.key)
