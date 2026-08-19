import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { deleteBattle } from '../../server/functions'
import { battleQuery, battlesQuery, deploymentsQuery, detachmentRulesQuery, gameReferencesQuery } from '../queries'
import { errorMessage } from '../queryClient'
import { type Side, sideName, sides } from '../sides'
import type { BattleView, Command } from '../../core/battle'
import type { PresentPlayer } from '../useLiveBattle'
import { BattleMenu } from './battle/BattleMenu'
import { DrawDialog, type WhenDrawn } from './battle/DrawDialog'
import type { Award, ReferenceCard, StratagemText } from './battle/MissionCards'
import { Scoreboard } from './battle/Scoreboard'
import { turnPrompt } from '../scoring'
import { dueForAdvance, dueFromTheirTurn, ScoringDialog } from './battle/ScoringDialog'
import { SidePanel } from './battle/SidePanel'
import { HEADING } from './battle/tints'
import { TurnControl } from './battle/TurnControl'
import { Report, type ReportPlayer } from './Report'

type Props = {
  view: BattleView
  /** Derived from both armies' dispositions, so it is the same on both devices. */
  mission: { id: string; name: string; roundCap: number | null; gameCap: number | null } | null
  present: PresentPlayer[]
  send: (command: Command) => void
  pending: boolean
  problem: string | null
}

/** Narrow screens cannot hold three columns, so they hold one at a time. */
const VIEWS = ['yours', 'battle', 'theirs'] as const
type Focus = (typeof VIEWS)[number]
type ScoringContext = Pick<BattleView, 'seq' | 'round' | 'phase' | 'activePlayerId'>

/**
 * The live battle, laid out as the table is: a side, the battle, the other side.
 *
 * Both formats use this one arrangement. A 2v1 does not add a third column — the
 * allied pair is one side, because the rules make it one: they share the turn, the
 * command points, the cards and the score, and only the armies are separate.
 */
export function Tracker({ view, mission, present, send, pending, problem }: Props) {
  const [focus, setFocus] = useState<Focus>('yours')
  const [scoring, setScoring] = useState<ScoringContext | null>(null)
  // Which turn the draw is open for, and which turn has already been taken past it.
  const [drawTurn, setDrawTurn] = useState<string | null>(null)
  const [drawnFor, setDrawnFor] = useState<string | null>(null)
  const table = sides(view)
  const yours = table.find((side) => side.isViewer)
  const active = table.find((side) => side.isActive)
  const ruleRequests = table.flatMap((side) =>
    side.armies.flatMap((army) => {
      const built = army.roster?.built
      if (!built) return []
      const detachmentNames = built.detachments?.map((detachment) => detachment.name) ?? (built.detachment ? [built.detachment] : [])
      return [{ side: side.index, catalogueId: built.catalogueId, detachmentNames }]
    }),
  )
  const ruleResults = useQueries({
    queries: ruleRequests.map((request) => detachmentRulesQuery(request.catalogueId, request.detachmentNames)),
  })
  const { data: deployments } = useQuery(deploymentsQuery())
  const { data: references } = useQuery(gameReferencesQuery())
  const deployment = deployments?.find((entry) => entry.id === view.deploymentId)
  const missionPack = references?.packs.find((entry) => entry.id === view.settings.missionPackId)
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
  const awardsFor = (side: Side, key: string, mode?: string): Award[] =>
    (
      rulesFor(side)
        .flatMap((rules) => [...rules.secondaries, ...rules.primaries])
        .find((card) => card.key === key)?.awards ?? []
    ).filter((award) => !award.mode || !mode || award.mode === mode)
  const referenceFor = (side: Side, key: string): ReferenceCard | undefined =>
    rulesFor(side)
      .flatMap((rules) => [...rules.primaries, ...rules.secondaries])
      .find((card) => card.key === key)
  const writtenFor = (side: Side, key: string): StratagemText | undefined => {
    const rules = rulesFor(side).find((candidate) => candidate.written.some((entry) => entry.key === key))
    const written = rules?.written.find((entry) => entry.key === key)
    return written ? { ...written, keywordRules: rules?.keywordRules ?? [] } : undefined
  }
  const whenDrawnFor = (side: Side, key: string): WhenDrawn | undefined =>
    rulesFor(side)
      .flatMap((rules) => rules.secondaries)
      .find((card) => card.key === key)?.whenDrawn ?? undefined
  const coreKeysFor = (side: Side) => new Set(rulesFor(side).flatMap((rules) => rules.core.map((stratagem) => stratagem.key)))
  // Seats are ordered by side, so both devices agree on which player is which colour.
  const reportPlayers: ReportPlayer[] = view.players.map((player) => ({
    id: player.id,
    name: player.name,
    className: player.side === 0 ? 'text-side-a' : 'text-side-b',
  }))
  const finished = view.status === 'finished'
  const solo = table.length < 2
  // The viewer's primary can use a lower ceiling than the conventional one.
  const guides = { primary: mission?.gameCap ?? view.guides.primary, secondary: view.guides.secondary }
  /** Which panel a narrow screen is showing, in the order the columns sit on a wide one. */
  const shown = (side: Side) => (side.isViewer ? 'yours' : 'theirs')

  // Only what the card itself says pays out at this moment, so the ask arrives with the phase that ends.
  const due = active && !finished ? dueForAdvance(view, active, (key, mode) => awardsFor(active, key, mode)) : []
  const helperBlockReason = view.advancePrompt && !yours?.isActive ? view.advancePrompt : null
  const activeNeedsRules = Boolean(active?.primaryCard || active?.secondaries.some((card) => card.status === 'active'))
  const activeRuleResults = ruleResults.filter((_, index) => ruleRequests[index]?.side === active?.index)
  const rulesBlockReason =
    activeNeedsRules && !activeRuleResults.some((result) => result.data) && activeRuleResults.some((result) => result.isPending)
      ? 'Loading the active side’s rules…'
      : null
  const blockReason = helperBlockReason ?? rulesBlockReason
  const advanceBlocked = Boolean(blockReason)
  const advance = () => {
    if (advanceBlocked || !active) return
    if (due.length) {
      setScoring({ seq: view.seq, round: view.round, phase: view.phase, activePlayerId: view.activePlayerId })
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
  const keeper = yours?.captain.id === view.viewerId
  const settlementRound = keeper ? view.settlementRound : null
  const settlementRuleResults = ruleResults.filter((_, index) => ruleRequests[index]?.side === yours?.index)
  const settlementRulesPending = settlementRuleResults.some((result) => result.isPending)
  const owedCards =
    settlementRound !== null && yours && !finished
      ? dueFromTheirTurn(settlementRound, yours, (key, mode) => awardsFor(yours, key, mode), heldKeys(yours))
      : []
  useEffect(() => {
    if (settlementRound === null || settlementRulesPending || owedCards.length || pending) return
    send({ kind: 'settle-opponent-turn' })
  }, [owedCards.length, pending, send, settlementRound, settlementRulesPending])
  // A tactical hand is dealt at the top of your own turn, and only once for it.
  const turnKey = `${view.round}-${view.activePlayerId ?? ''}`
  const handShort =
    !finished &&
    keeper &&
    yours?.isActive &&
    yours.secondaryMode === 'tactical' &&
    view.phase === 'command' &&
    yours.secondaries.filter((card) => card.status === 'active').length < 2 &&
    yours.remainingSecondaries.length > 0
  // Latched, because the hand stops being short the moment it is dealt and the player
  // still has to see what they drew and whether a card may go back.
  useEffect(() => {
    if (handShort && drawnFor !== turnKey) setDrawTurn(turnKey)
  }, [handShort, drawnFor, turnKey])
  const prompt = settlementRound !== null ? (owedCards.length ? 'owed' : null) : turnPrompt(0, drawTurn === turnKey && drawnFor !== turnKey)

  return (
    <main className={`w-full space-y-3 px-3 lg:pb-8 ${finished ? 'pb-8' : 'pb-32'}`}>
      <Scoreboard
        view={view}
        sides={table}
        outcome={finished ? outcome(table, view) : null}
        menu={
          <BattleMenu
            finished={finished}
            canDelete={view.creatorId === view.viewerId}
            pending={pending || remove.isPending}
            onFinishEarly={() => send({ kind: 'end-battle', reason: 'finished-early' })}
            onConcede={() => send({ kind: 'end-battle', reason: 'conceded', concededBy: view.viewerId })}
            onReopen={() => send({ kind: 'reopen-battle' })}
            onDelete={() => remove.mutate()}
          />
        }
      />

      {/* A practice battle has nobody across the table, so it offers neither a tab nor a column for them. */}
      <Tabs value={focus} onValueChange={(value) => setFocus(value as Focus)} className="lg:hidden">
        <TabsList className={`grid w-full ${solo ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <TabsTrigger value="yours">Your side</TabsTrigger>
          <TabsTrigger value="battle">Battle</TabsTrigger>
          {solo ? null : <TabsTrigger value="theirs">Opponent</TabsTrigger>}
        </TabsList>
      </Tabs>

      <div
        className={`mx-auto grid items-start gap-3 ${
          solo
            ? 'max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)]'
            : 'max-w-7xl lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)_minmax(0,1fr)]'
        }`}
      >
        {table.map((side) => (
          <SidePanel
            key={side.index}
            view={view}
            side={side}
            present={present}
            coreKeys={coreKeysFor(side)}
            pending={pending}
            send={send}
            awardsFor={awardsFor}
            referenceFor={referenceFor}
            writtenFor={writtenFor}
            guides={guides}
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
              className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-panel/98 px-3 py-2 backdrop-blur lg:static lg:rounded-lg lg:border lg:bg-panel lg:p-3 lg:backdrop-filter-none"
            />
          )}

          <section className={`space-y-3 rounded-lg border border-edge bg-panel p-3 ${focus === 'battle' ? '' : 'hidden lg:block'}`}>
            {finished ? (
              <p className="rounded-sm border border-edge bg-sunken p-3 text-center text-sm text-dim">
                {resultLabel(view) ?? 'The battle is over.'} Reopen it from the battle menu to keep playing.
              </p>
            ) : null}

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <Fact label="Mission" value={mission?.name ?? 'Matched play'} />
              <Fact label="Mission pack" value={missionPack?.name ?? 'Not chosen'} />
              <Fact
                label="Battlefield"
                value={deployment ? `${deployment.name} · ${deployment.objectives.length} objectives` : 'Not chosen'}
              />
              <Fact label="Attacker" value={view.players.find((player) => player.id === view.attackerId)?.name ?? 'Not chosen'} />
              <Fact label="Battle size" value={view.settings.limit ? `${view.settings.limit} points` : 'Legacy format'} />
              <Fact label="Format" value={formatName(view, table)} />
            </dl>

            <div className="border-t border-edge pt-3">
              <p className={HEADING}>Battle events</p>
              <Report token={view.token} open players={reportPlayers} />
            </div>

            {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
            {remove.error ? <p className="text-sm text-destructive">{errorMessage(remove.error)}</p> : null}
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
          referenceFor={(key) => referenceFor(active, key)}
          onCancel={() => setScoring(null)}
          onDone={() => {
            setScoring(null)
            send({ kind: 'advance', playerId: active.captain.id })
          }}
        />
      ) : null}

      {prompt === 'owed' && yours ? (
        <ScoringDialog
          side={yours}
          due={owedCards}
          moment="end of their turn"
          confirmLabel="Take the turn"
          pending={pending}
          send={send}
          referenceFor={(key) => referenceFor(yours, key)}
          onDone={() => send({ kind: 'settle-opponent-turn' })}
        />
      ) : null}

      {prompt === 'draw' && yours ? (
        <DrawDialog
          key={turnKey}
          side={yours}
          seq={view.seq}
          round={view.round}
          pending={pending}
          send={send}
          referenceFor={(key) => referenceFor(yours, key)}
          whenDrawnFor={(key) => whenDrawnFor(yours, key)}
          onDone={() => setDrawnFor(turnKey)}
        />
      ) : null}
    </main>
  )
}

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

function formatName(view: BattleView, table: Side[]) {
  if (view.settings.solo) return 'Solo practice'
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
