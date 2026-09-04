import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { deleteBattle } from '../../server/functions'
import { battleQuery, battlesQuery, deploymentsQuery, detachmentRulesQuery, gameReferencesQuery } from '../queries'
import { missionCardsByKey, primaryCards, secondaryCards } from '../missionDeck'
import { appliesInMode } from '../missionText'
import { automaticAttemptsExhausted, claimAutomaticAttempt } from '../automaticAttempts'
import { errorMessage } from '../queryClient'
import { armyRulesRequest } from '../sideRules'
import { celebrateVictory } from '../victory'
import { type Side, type SideMission, sides } from '../sides'
import type { Command } from '../../core/battle'
import type { BattleView } from '../../core/battleView'
import { battleOutcome, battleResult } from '../battleOutcome'
import { BattleMenu } from './battle/BattleMenu'
import { DrawDialog, type WhenDrawn } from './battle/DrawDialog'
import { DiscardSecondaryDialog } from './battle/DiscardSecondaryDialog'
import type { Award, ReferenceCard, StratagemText } from './battle/MissionCards'
import { Scoreboard } from './battle/Scoreboard'
import { SecretMissionHandoff } from './battle/SecretMissionHandoff'
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

const EMPTY_KEYS: ReadonlySet<string> = new Set()

/** Narrow screens cannot hold three columns, so they hold one at a time. */
const VIEWS = ['yours', 'battle', 'theirs'] as const
type Focus = (typeof VIEWS)[number]

/**
 * The live battle, laid out as the table is: a side, the battle, the other side.
 *
 * Both formats use this one arrangement. A 2v1 does not add a third column — the
 * allied pair is one side, because the rules make it one: they share the turn, the
 * command points, the cards and the score, and only the armies are separate.
 */
export function Tracker({ view, missions, send, pending, problem }: Props) {
  const [focus, setFocus] = useState<Focus>('yours')
  // Refetches that change nothing keep their object identity through the query
  // cache's structural sharing, so these memos hold between commands too.
  const table = useMemo(() => sides(view, missions), [view, missions])
  const yours = table.find((side) => side.isViewer)
  const active = table.find((side) => side.isActive)
  const ruleRequests = useMemo(
    () =>
      table.flatMap((side) =>
        side.armies.flatMap((army) => {
          const request = armyRulesRequest(army.roster)
          return request.catalogueId ? [{ side: side.index, ...request }] : []
        }),
      ),
    [table],
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
  const rulesFor = useCallback(
    (side: Side) => ruleResults.flatMap((result, index) => (ruleRequests[index]?.side === side.index && result.data ? [result.data] : [])),
    [ruleResults, ruleRequests],
  )
  // The cards are the instance's, not a side's: one deck, read the same way for both.
  const primaryDeck = useMemo(() => primaryCards(references), [references])
  const secondaryDeck = useMemo(() => secondaryCards(references), [references])
  const cardsByKey = useMemo(() => missionCardsByKey(references), [references])
  const awardsFor = useCallback(
    (key: string, mode?: string): Award[] => (cardsByKey.get(key)?.awards ?? []).filter((award) => appliesInMode(award, mode)),
    [cardsByKey],
  )
  const referenceFor = useCallback((key: string): ReferenceCard | undefined => cardsByKey.get(key), [cardsByKey])
  const writtenFor = useCallback(
    (side: Side, key: string): StratagemText | undefined => {
      const rules = rulesFor(side).find((candidate) => candidate.written.some((entry) => entry.key === key))
      const written = rules?.written.find((entry) => entry.key === key)
      return written ? { ...written, keywordRules: rules?.keywordRules ?? [] } : undefined
    },
    [rulesFor],
  )
  const whenDrawnFor = useCallback(
    (key: string): WhenDrawn | undefined => secondaryDeck.find((card) => card.key === key)?.whenDrawn ?? undefined,
    [secondaryDeck],
  )
  const coreKeysBySide = useMemo(
    () =>
      new Map(table.map((side) => [side.index, new Set(rulesFor(side).flatMap((rules) => rules.core.map((stratagem) => stratagem.key)))])),
    [table, rulesFor],
  )
  // Seats are ordered by side, so both devices agree on which player is which colour.
  const reportPlayers: ReportPlayer[] = useMemo(
    () =>
      view.players.map((player) => ({
        id: player.id,
        name: player.name,
        className: player.side === 0 ? 'text-side-a' : 'text-side-b',
      })),
    [view.players],
  )
  const finished = view.status === 'finished'
  const attemptedPrepRepairs = useRef(new Map<string, number>())
  const repairSide = table.find(
    (side) =>
      side.played &&
      side.mission &&
      !side.secondaryDeckReady &&
      side.remainingSecondaries.length === 0 &&
      (side.secondaryMode === 'fixed' || side.secondaries.length === 0),
  )
  const repairPrimary = repairSide?.primaryCard ?? primaryDeck.find((card) => card.key === repairSide?.mission?.id) ?? null
  useEffect(() => {
    if (finished || pending || !references || !secondaryDeck.length || !repairSide || !repairPrimary) return
    const key = `${view.seq}:${repairSide.captain.id}`
    if (!claimAutomaticAttempt(attemptedPrepRepairs.current, key)) return
    send({
      kind: 'set-prep',
      playerId: repairSide.captain.id,
      stratagems: repairSide.stratagems,
      secondaries:
        repairSide.secondaryMode === 'fixed'
          ? repairSide.secondaries.filter((card) => !card.secret).map(({ key: cardKey, name, awards }) => ({ key: cardKey, name, awards }))
          : [],
      secondaryDeck: secondaryDeck.map(({ key: cardKey, name, awards }) => ({ key: cardKey, name, awards })),
      primary: repairPrimary,
      secondaryMode: repairSide.secondaryMode,
    })
  }, [finished, pending, references, repairPrimary, repairSide, secondaryDeck, send, view.seq])
  // A battle whose second seat is still empty draws one side, not a gap where the other goes.
  const oneSided = table.length < 2
  // A side's own mission can state a lower ceiling than the conventional one, and the
  // two sides need not be playing the same mission, so this is asked of each side.
  const guidesBySide = useMemo(
    () =>
      new Map(
        table.map((side) => [
          side.index,
          {
            primary: side.mission?.gameCap ?? view.guides.primary,
            secondary: side.mission?.secondaryGameCap ?? view.guides.secondary,
          },
        ]),
      ),
    [table, view.guides.primary, view.guides.secondary],
  )
  const guidesFor = (side: Side) => guidesBySide.get(side.index) ?? view.guides
  /** Which panel a narrow screen is showing, in the order the columns sit on a wide one. */
  const shown = (side: Side) => (side.isViewer ? 'yours' : 'theirs')
  const settlementRound = view.settlementRound
  const turnKey = `${view.round}-${view.activePlayerId ?? ''}`
  const needsDraw =
    !finished &&
    active?.secondaryMode === 'tactical' &&
    view.phase === 'command' &&
    active.secondariesDrawnThisTurn.length < active.secondaryDrawTarget &&
    active.remainingSecondaries.length > 0
  const needsDrawAcknowledgement =
    !finished &&
    active?.secondaryMode === 'tactical' &&
    view.phase === 'command' &&
    active.secondariesToReview.length > 0 &&
    !view.drawAcknowledged

  // Only what the card itself says pays out at this moment, so the ask arrives with the phase that ends.
  const due = active && !finished ? dueForAdvance(view, active, awardsFor) : []
  const activeNeedsReferences = Boolean(
    (active?.primaryCard && active.primaryCard.awards === undefined) ||
    active?.secondaries.some((card) => card.status === 'active' && card.awards === undefined),
  )
  const blockReason =
    settlementRound !== null
      ? 'Finish the previous turn’s scoring first.'
      : needsDraw
        ? 'Draw the active side’s secondary missions first.'
        : needsDrawAcknowledgement
          ? 'Review the active side’s new secondary missions first.'
          : activeNeedsReferences && deckUnknown
            ? 'Loading the active side’s mission cards…'
            : null
  const advanceBlocked = Boolean(blockReason)
  const advance = () => {
    if (advanceBlocked || !active) return
    const discardable = discardableSecondaries(active)
    const activeSecretMissionAction = view.settlementRound === null && view.secretMissionActionPlayerId === active.captain.id
    if (due.length || activeSecretMissionAction || (view.phase === 'end' && discardable.length)) {
      send({ kind: 'request-advance', playerId: active.captain.id })
      return
    }
    send({ kind: 'advance', playerId: active.captain.id })
  }
  const settlementSide = table.find((side) => side.captain.id === view.settlementPlayerId)
  const secretMissionActionSide = table.find((side) => side.captain.id === view.secretMissionActionPlayerId)
  const activeSecretMissionAction = Boolean(
    view.settlementRound === null && active && secretMissionActionSide?.captain.id === active.captain.id,
  )
  const settlementSecretMissionAction = Boolean(
    view.settlementRound !== null && settlementSide && secretMissionActionSide?.captain.id === settlementSide.captain.id,
  )
  const settlementRuleResults = ruleResults.filter((_, index) => ruleRequests[index]?.side === settlementSide?.index)
  const settlementNeedsReferences = Boolean(
    (settlementSide?.primaryCard && settlementSide.primaryCard.awards === undefined) ||
    settlementSide?.secondaries.some((secondary) => secondary.status === 'active' && secondary.awards === undefined),
  )
  const settlementRulesPending = settlementNeedsReferences && (settlementRuleResults.some((result) => result.isPending) || deckUnknown)
  const owedCards =
    settlementRound !== null && settlementSide && !finished
      ? dueFromTheirTurn(settlementRound, view.rounds, settlementSide, awardsFor, heldKeys(settlementSide))
      : []
  const attemptedEmptySettlements = useRef(new Map<string, number>())
  const emptySettlementKey = `${view.seq}:${settlementRound ?? ''}:${view.settlementPlayerId ?? ''}`
  const emptySettlementReady =
    settlementRound !== null && !settlementRulesPending && !settlementSecretMissionAction && owedCards.length === 0
  const emptySettlementRetryNeeded =
    emptySettlementReady && automaticAttemptsExhausted(attemptedEmptySettlements.current, emptySettlementKey)
  useEffect(() => {
    if (!emptySettlementReady || pending || !claimAutomaticAttempt(attemptedEmptySettlements.current, emptySettlementKey)) return
    send({ kind: 'settle-opponent-turn' })
  }, [emptySettlementKey, emptySettlementReady, pending, send])
  // The win is this device's to celebrate only when the side it is seated on took it.
  const result = finished ? battleResult(table, view) : null
  const wonSide = result?.kind === 'win' ? table.find((side) => side.index === result.side.index) : undefined
  const wonHere = Boolean(wonSide?.isViewer)
  useEffect(() => {
    if (wonHere && wonSide) void celebrateVictory(view.token, wonSide.index)
  }, [view.token, wonHere, wonSide])
  const prompt = settlementRound !== null ? (owedCards.length ? 'owed' : null) : turnPrompt(0, needsDraw || needsDrawAcknowledgement)
  const discardable = active ? discardableSecondaries(active) : []

  return (
    <main data-battle-tracker className={`w-full space-y-3 px-3 lg:pb-8 ${finished ? 'pb-8' : 'pb-32'}`}>
      <Scoreboard view={view} sides={table} outcome={finished ? battleOutcome(table, view) : null} />

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
            coreKeys={coreKeysBySide.get(side.index) ?? EMPTY_KEYS}
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
            {emptySettlementRetryNeeded ? (
              <button
                type="button"
                className="text-sm font-medium text-link underline underline-offset-4"
                disabled={pending}
                onClick={() => send({ kind: 'settle-opponent-turn' })}
              >
                Retry finishing the previous turn
              </button>
            ) : null}
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
                players={view.players}
                onFinishEarly={() => send({ kind: 'end-battle', reason: 'finished-early' })}
                onConcede={(playerId) => send({ kind: 'end-battle', reason: 'conceded', concededBy: playerId })}
                onReopen={() => send({ kind: 'reopen-battle' })}
                onDelete={() => remove.mutate()}
              />
            </div>
          </section>
        </div>
      </div>

      {settlementRound === null &&
      !needsDraw &&
      !needsDrawAcknowledgement &&
      view.advanceRequested &&
      !view.scoringAcknowledged &&
      !activeSecretMissionAction &&
      due.length &&
      active ? (
        <ScoringDialog
          side={active}
          due={due}
          moment={view.phase === 'end' ? 'end of turn' : `end of ${view.phase} phase`}
          confirmLabel={view.phase === 'end' ? 'Pass the turn' : 'End the phase'}
          pending={pending}
          send={send}
          referenceFor={referenceFor}
          round={view.round}
          undoable={view.undoable}
          undoableDraw={view.undoableDraw}
          onCancel={() => send({ kind: 'cancel-advance', playerId: active.captain.id })}
          onDone={(completedSecondaryKeys, scored) => {
            const unresolved = discardableSecondaries(active).filter((key) => !completedSecondaryKeys.includes(key))
            if (view.phase !== 'end' || !unresolved.length) {
              if (!scored) send({ kind: 'acknowledge-scoring', playerId: active.captain.id })
              send({ kind: 'advance', playerId: active.captain.id })
            } else if (!scored) {
              send({ kind: 'acknowledge-scoring', playerId: active.captain.id })
            }
          }}
        />
      ) : null}

      {secretMissionActionSide &&
      ((view.advanceRequested && activeSecretMissionAction && !needsDraw && !needsDrawAcknowledgement) || settlementSecretMissionAction) ? (
        <SecretMissionHandoff
          side={secretMissionActionSide}
          pending={pending}
          onCancel={
            activeSecretMissionAction ? () => send({ kind: 'cancel-advance', playerId: secretMissionActionSide.captain.id }) : undefined
          }
          onReveal={() => send({ kind: 'reveal-secret', playerId: secretMissionActionSide.captain.id })}
          undoable={view.undoable}
          undoableDraw={view.undoableDraw}
          send={send}
        />
      ) : null}

      {prompt === 'owed' && settlementSide && !settlementSecretMissionAction ? (
        <ScoringDialog
          side={settlementSide}
          due={owedCards}
          moment="end of their turn"
          confirmLabel="Take the turn"
          pending={pending}
          send={send}
          referenceFor={referenceFor}
          round={settlementRound ?? view.round}
          undoable={view.undoable}
          undoableDraw={view.undoableDraw}
          onDone={() => send({ kind: 'settle-opponent-turn' })}
        />
      ) : null}

      {settlementRound === null &&
      view.advanceRequested &&
      (view.scoringAcknowledged || !due.length) &&
      view.phase === 'end' &&
      discardable.length &&
      active ? (
        <DiscardSecondaryDialog
          side={active}
          keys={discardable}
          pending={pending}
          send={send}
          undoable={view.undoable}
          undoableDraw={view.undoableDraw}
          onDone={() => {
            send({ kind: 'advance', playerId: active.captain.id })
          }}
        />
      ) : null}

      {prompt === 'draw' && active ? (
        <DrawDialog
          key={turnKey}
          side={active}
          round={view.round}
          undoable={view.undoable}
          confirmUndo={view.undoableDraw}
          pending={pending}
          send={send}
          referenceFor={referenceFor}
          whenDrawnFor={whenDrawnFor}
          onDone={() => send({ kind: 'acknowledge-draw', playerId: active.captain.id })}
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

/** The cards a side was holding, as keys, so a later hand can be told from this one. */
const heldKeys = (side: Side | undefined) => (side?.secondaries ?? []).filter((card) => card.status === 'active').map((card) => card.key)
