import { GuideHelp } from '../onboarding/GuideHelp'
import { isGuestSeat } from '../../../core/newBattle'
import { GuestInvite } from './GuestInvite'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readStoredValue, useStoredValue, writeStoredValue } from '../../storedValue'
import { useHydrated } from '../../useClientValue'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { deleteBattle } from '../../functions'
import { deploymentFor } from '../../battleSummary'
import { battleQuery, battlesQuery, deploymentsQuery, detachmentRulesQuery, gameReferencesQuery } from '../../queries'
import { missionCardsByKey, primaryCards, secondaryCards } from './missionDeck'
import {
  MISSION_ACTION_REMINDER_PREFIX,
  missionActionReminderStorageKey,
  missionActionReminders,
  missionActionRemindersEnabled as storedMissionActionRemindersEnabled,
} from '../../missionActionReminders'
import { appliesInMode, type MissionAward } from '../../missionText'
import { automaticAttemptsExhausted, claimAutomaticAttempt } from './automaticAttempts'
import type { SendCommand } from './useCommand'
import {
  parseReminderDismissals,
  pruneReminderDismissals,
  reminderDismissalKey,
  reminderDismissalKeys,
  reminderDismissalStorageKey,
  serializeReminderDismissals,
  type ReminderDismissalContext,
  type ReminderDismissalScope,
} from './reminderDismissals'
import { armyRulesRequest } from './sideRules'
import { type Side, type SideMission, sides } from '../../sides'
import { asSecondary, battleSizeText } from '../../../core/battle'
import type { BattleClock } from '../../../core/battleClock'
import type { BattleView, MissionChoiceView } from '../../../core/battleView'
import { remindersDueAt, reminderTimingLabel, roundReminderMoment, type ReminderTiming, type RosterReminder } from '../../../core/reminders'
import { useWatchBattle } from './useWatchBattle'
import { BattleMenu } from './BattleMenu'
import { MissedActionDialog } from './MissedActionDialog'
import { ReminderDialog } from './ReminderDialog'
import type { WhenDrawn } from '../../../contracts/missions'
import { DrawDialog, type DrawSelection } from './DrawDialog'
import { MissionSelectionDialog } from './MissionSelectionDialog'
import { isManualSelection } from '../../../core/missionSelections'
import { DiscardSecondaryDialog } from './DiscardSecondaryDialog'
import type { ReferenceCard, StratagemText } from './MissionCards'
import { Scoreboard } from './Scoreboard'
import { SecretMissionHandoff } from './SecretMissionHandoff'
import { turnPrompt, type DueCard } from '../../scoring'
import { dueForAdvance, dueFromTheirTurn, ScoringDialog, type ScoringAnswers } from './ScoringDialog'
import { BattleCombatDialog, type BattleCombatSelection } from '../simulator/BattleCombatDialog'
import { SidePanel } from './SidePanel'
import { TurnControl } from './TurnControl'
import { TwistName } from './MissionTwist'
import { Report, reportPlayers } from './Report'
import { BattleMinimizeContext } from './BattlePromptDialog'
import { advanceOnboarding, ONBOARDING_FOCUS_EVENT, storedOnboardingFocus, type OnboardingFocus } from '../onboarding/onboarding'
import { Fact } from '../../components/Fact'
import { BattlefieldFact } from './BattlefieldFact'
import { BattleNote } from './BattleNote'
import { MANUAL_TRACKING_LIMITS } from './manualTracking'
import { Problem } from '../../components/Problem'

type Props = {
  view: BattleView
  clock: BattleClock
  /** Each side's own mission, derived from both armies' dispositions, so it is the same on both devices. */
  missions: { side: number; mission: SideMission | null }[]
  send: SendCommand
  pending: boolean
  problem: string | null
}

const EMPTY_KEYS: ReadonlySet<string> = new Set()
const EMPTY_REMINDERS: readonly RosterReminder[] = []

type ReminderPrompt = {
  reminders: RosterReminder[]
  moment: string
  confirmLabel: string
  context: ReminderDismissalContext
  advanceAfterDismissal?: boolean
}

/** Each queued prompt with only the reminders `keep` passes, dropping prompts left with none. */
function keepReminders(prompts: readonly ReminderPrompt[], keep: (reminder: RosterReminder, prompt: ReminderPrompt) => boolean) {
  return prompts.flatMap((prompt) => {
    const reminders = prompt.reminders.filter((reminder) => keep(reminder, prompt))
    return reminders.length ? [{ ...prompt, reminders }] : []
  })
}

/** Queued prompts keep only reminders still on the roster; mission action reminders come from the cards, not the roster. */
function withRosterReminders(prompts: readonly ReminderPrompt[], rosterReminders: readonly RosterReminder[]) {
  const available = new Set(rosterReminders.map((reminder) => reminder.key))
  return keepReminders(prompts, (reminder) => reminder.key.startsWith(MISSION_ACTION_REMINDER_PREFIX) || available.has(reminder.key))
}

/** The moment of the turn a reminder belongs to. */
const momentOf = (view: Pick<BattleView, 'round' | 'activePlayerId' | 'phase'>): ReminderDismissalContext => ({
  round: view.round,
  activePlayerId: view.activePlayerId,
  phase: view.phase,
})

const sameMoment = (left: ReminderDismissalContext, right: ReminderDismissalContext) =>
  left.round === right.round && left.activePlayerId === right.activePlayerId && left.phase === right.phase

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
export function Tracker({ view, clock, missions, send, pending, problem }: Props) {
  const [focus, setFocus] = useState<Focus>('yours')
  useEffect(() => {
    advanceOnboarding('battle', 'battle-setup-begin', 'battle-live-score')
    const reveal = (next: OnboardingFocus | undefined) => {
      if (next?.step === 'battle-live-side') setFocus('yours')
      if (next?.step === 'battle-live-report') setFocus('battle')
    }
    reveal(storedOnboardingFocus(view.viewerId ?? ''))
    const changed = (event: Event) => reveal((event as CustomEvent<OnboardingFocus | undefined>).detail)
    window.addEventListener(ONBOARDING_FOCUS_EVENT, changed)
    return () => window.removeEventListener(ONBOARDING_FOCUS_EVENT, changed)
  }, [view.viewerId])
  const [combatSelection, setCombatSelection] = useState<BattleCombatSelection | null>(null)
  const [recordingMissed, setRecordingMissed] = useState(false)
  const [reminderPrompts, setReminderPrompts] = useState<ReminderPrompt[]>([])
  // Dismissals and preferences live in browser storage, so reminders wait for the browser's first render.
  const dismissalsReady = useHydrated()
  const [promptMinimized, setPromptMinimized] = useState(false)
  const [skippedChoices, setSkippedChoices] = useState<ReadonlySet<string>>(new Set())
  const minimizedDialogs = useRef<string[]>([])
  const registerMinimized = useCallback((id: string, minimized: boolean) => {
    const current = minimizedDialogs.current
    if (minimized && !current.includes(id)) current.push(id)
    if (!minimized) minimizedDialogs.current = current.filter((candidate) => candidate !== id)
    setPromptMinimized(minimizedDialogs.current.length > 0)
    return minimizedDialogs.current.indexOf(id)
  }, [])
  const sendAction: SendCommand = useCallback(
    (command, options) => {
      if (promptMinimized) options?.complete?.(false)
      else send(command, options)
    },
    [promptMinimized, send],
  )
  // Answers in progress survive a dialog closing for a reminder or a minimised prompt.
  const [scoringDrafts, setScoringDrafts] = useState<ReadonlyMap<string, { signature: string; answers: ScoringAnswers }>>(new Map())
  const [drawDrafts, setDrawDrafts] = useState<ReadonlyMap<string, DrawSelection>>(new Map())
  const [discardDrafts, setDiscardDrafts] = useState<ReadonlyMap<string, string[]>>(new Map())
  const reminderPrompt = reminderPrompts[0] ?? null
  // Refetches that change nothing keep their object identity through the query
  // cache's structural sharing, so these memos hold between commands too.
  const table = useMemo(() => sides(view, missions), [view, missions])
  const yours = table.find((side) => side.isViewer)
  const active = table.find((side) => side.isActive)
  const viewer = view.players.find((player) => player.isViewer)
  const viewerReminders = viewer?.roster?.remindersEnabled === false ? EMPTY_REMINDERS : (viewer?.roster?.reminders ?? EMPTY_REMINDERS)
  // Another battle starts with no prompts, and a reminder taken off the roster leaves the queued ones.
  const [promptsFor, setPromptsFor] = useState({ battle: view.token, reminders: viewerReminders })
  if (promptsFor.battle !== view.token || promptsFor.reminders !== viewerReminders) {
    setPromptsFor({ battle: view.token, reminders: viewerReminders })
    setReminderPrompts((current) => (promptsFor.battle === view.token ? withRosterReminders(current, viewerReminders) : []))
  }
  const reminderTurn: ReminderTiming['turn'] | null =
    viewer && active ? (viewer.side === active.index ? 'your-turn' : 'opponent-turn') : null
  const reminderContext = useMemo(
    () => ({ round: view.round, activePlayerId: view.activePlayerId, phase: view.phase }),
    [view.activePlayerId, view.phase, view.round],
  )
  const dismissalStorageKey = reminderDismissalStorageKey(view.token)
  const actionReminderStorageKey = missionActionReminderStorageKey(view.token)
  const storedDismissals = useStoredValue(dismissalStorageKey)
  const dismissedReminders = useMemo(() => parseReminderDismissals(storedDismissals), [storedDismissals])
  const actionRemindersEnabled = storedMissionActionRemindersEnabled(useStoredValue(actionReminderStorageKey))
  const updateActionReminders = useCallback(
    (enabled: boolean) => {
      writeStoredValue(actionReminderStorageKey, enabled ? 'on' : 'off')
      if (!enabled)
        setReminderPrompts((current) => keepReminders(current, (reminder) => !reminder.key.startsWith(MISSION_ACTION_REMINDER_PREFIX)))
    },
    [actionReminderStorageKey],
  )
  const reminderDismissed = useCallback(
    (reminderKey: string, context: ReminderDismissalContext) =>
      reminderDismissalKeys(reminderKey, context).some((key) => dismissedReminders.has(key)),
    [dismissedReminders],
  )
  const rememberReminder = useCallback(
    (reminderKey: string, scope: ReminderDismissalScope, context: ReminderDismissalContext) => {
      // Read back from storage, so several dismissals in one handler all keep.
      const dismissed = parseReminderDismissals(readStoredValue(dismissalStorageKey)).add(reminderDismissalKey(reminderKey, scope, context))
      writeStoredValue(dismissalStorageKey, serializeReminderDismissals(dismissed))
      setReminderPrompts((current) =>
        keepReminders(
          current,
          (candidate, prompt) => !reminderDismissalKeys(candidate.key, prompt.context).some((key) => dismissed.has(key)),
        ),
      )
    },
    [dismissalStorageKey],
  )
  const remindersAt = useCallback(
    (moments: readonly ReminderTiming[], context: ReminderDismissalContext) =>
      remindersDueAt(viewerReminders, moments, context.round).filter((reminder) => !reminderDismissed(reminder.key, context)),
    [reminderDismissed, viewerReminders],
  )
  const enqueueReminderPrompt = useCallback((prompt: ReminderPrompt) => {
    setReminderPrompts((current) => {
      const duplicate = current.some((queued) => queued.moment === prompt.moment && sameMoment(queued.context, prompt.context))
      return duplicate ? current : [...current, prompt]
    })
  }, [])
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
  // What a card pays is read out of the references, not out of a side's own rules,
  // so "do we know what the cards say yet" has to watch this query too. An instance
  // with nothing synced answers null and is not waiting on anything; a request still
  // in flight or one that failed is, and neither may be read as a card that pays nothing.
  const deckUnknown = referencesQuery.isPending || referencesQuery.isError
  const deployment = deploymentFor(view.deploymentId, deployments)
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
    (key: string, mode?: string): MissionAward[] => (cardsByKey.get(key)?.awards ?? []).filter((award) => appliesInMode(award, mode)),
    [cardsByKey],
  )
  const referenceFor = useCallback((key: string): ReferenceCard | undefined => cardsByKey.get(key), [cardsByKey])
  useWatchBattle(view, clock, missions, referenceFor, reminderPrompts)
  const activeMissionActionReminders = useMemo(
    () => (active?.isViewer ? missionActionReminders(active, referenceFor) : EMPTY_REMINDERS),
    [active, referenceFor],
  )
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
  const reportedPlayers = useMemo(() => reportPlayers(view.players), [view.players])
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
    if (pending || promptMinimized || !references || !secondaryDeck.length || !repairSide || !repairPrimary) return
    const key = `${view.seq}:${repairSide.captain.id}`
    if (!claimAutomaticAttempt(attemptedPrepRepairs.current, key)) return
    send({
      kind: 'set-prep',
      playerId: repairSide.captain.id,
      stratagems: repairSide.stratagems,
      secondaries: repairSide.secondaryMode === 'fixed' ? repairSide.secondaries.filter((card) => !card.secret).map(asSecondary) : [],
      secondaryDeck: secondaryDeck.map(asSecondary),
      primary: repairPrimary,
      secondaryMode: repairSide.secondaryMode,
    })
  }, [pending, promptMinimized, references, repairPrimary, repairSide, secondaryDeck, send, view.seq])
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
  const turnDraftKey = JSON.stringify([view.token, turnKey])
  const needsDraw =
    active?.secondaryMode === 'tactical' &&
    view.phase === 'command' &&
    active.secondariesDrawnThisTurn.length < active.secondaryDrawTarget &&
    active.remainingSecondaries.length > 0
  const needsDrawAcknowledgement =
    active?.secondaryMode === 'tactical' && view.phase === 'command' && active.secondariesToReview.length > 0 && !view.drawAcknowledged
  const choiceKey = (choice: MissionChoiceView) => JSON.stringify([choice.playerId, choice.cardKey, choice.occurrence, choice.kind])
  // Offered once as its moment arrives; a skipped choice stays on its card until the moment passes.
  const missionChoice = view.missionChoices?.find(
    (choice) => !isManualSelection(choice.kind) && choice.canChoose && !skippedChoices.has(choiceKey(choice)),
  )
  const missedMoments = view.missedMoments ?? []

  // Only what the card itself says pays out at this moment, so the ask arrives with the phase that ends.
  const due = active ? dueForAdvance(view, active, awardsFor) : []
  const activeScoringMoment = view.phase === 'end' ? 'end of turn' : `end of ${view.phase} phase`
  const scoringDraft = (side: Side, round: number, moment: string, cards: readonly DueCard[]) => {
    const id = JSON.stringify([view.token, side.captain.id, round, moment])
    const signature = JSON.stringify(cards.map((card) => [card.key, card.awards]))
    const saved = scoringDrafts.get(id)
    return {
      key: `${id}:${signature}`,
      initialAnswers: saved?.signature === signature ? saved.answers : undefined,
      onAnswersChange: (answers: ScoringAnswers) => setScoringDrafts((current) => new Map(current).set(id, { signature, answers })),
    }
  }
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
  const discardable = active ? discardableSecondaries(active) : []
  const secretMissionActionSide = table.find((side) => side.captain.id === view.secretMissionActionPlayerId)
  const activeSecretMissionAction = Boolean(settlementRound === null && active && secretMissionActionSide?.captain.id === active.captain.id)
  const advanceNow = () => {
    if (promptMinimized || advanceBlocked || !active) return
    if (due.length || activeSecretMissionAction || (view.phase === 'end' && discardable.length)) {
      send({ kind: 'request-advance', playerId: active.captain.id })
      return
    }
    send({ kind: 'advance', playerId: active.captain.id })
  }
  const advance = () => {
    if (promptMinimized) return
    if (advanceBlocked || !active || !reminderTurn || view.phase === 'end') {
      advanceNow()
      return
    }
    const moment: ReminderTiming = { moment: 'phase-end', phase: view.phase, turn: reminderTurn }
    const context = momentOf(view)
    const reminders = remindersAt([moment], context)
    if (!reminders.length) {
      advanceNow()
      return
    }
    enqueueReminderPrompt({
      reminders,
      moment: reminderTimingLabel(moment),
      confirmLabel: view.phase === 'fight' ? 'Continue to end of turn' : 'End the phase',
      context,
      advanceAfterDismissal: true,
    })
  }
  const settlementSide = table.find((side) => side.captain.id === view.settlementPlayerId)
  const settlementSecretMissionAction = Boolean(
    settlementRound !== null && settlementSide && secretMissionActionSide?.captain.id === settlementSide.captain.id,
  )
  const settlementRuleResults = ruleResults.filter((_, index) => ruleRequests[index]?.side === settlementSide?.index)
  const settlementNeedsReferences = Boolean(
    (settlementSide?.primaryCard && settlementSide.primaryCard.awards === undefined) ||
    settlementSide?.secondaries.some((secondary) => secondary.status === 'active' && secondary.awards === undefined),
  )
  const settlementRulesPending = settlementNeedsReferences && (settlementRuleResults.some((result) => result.isPending) || deckUnknown)
  const owedCards =
    settlementRound !== null && settlementSide
      ? dueFromTheirTurn(settlementRound, view.rounds, settlementSide, awardsFor, heldKeys(settlementSide), view.endOfBattle)
      : []
  const activeScoringDraft = active ? scoringDraft(active, view.round, activeScoringMoment, due) : null
  const owedScoringDraft = settlementSide
    ? scoringDraft(settlementSide, settlementRound ?? view.round, 'end of their turn', owedCards)
    : null
  const attemptedEmptySettlements = useRef(new Map<string, number>())
  const emptySettlementKey = `${view.seq}:${settlementRound ?? ''}:${view.settlementPlayerId ?? ''}`
  const emptySettlementReady =
    settlementRound !== null && !settlementRulesPending && !settlementSecretMissionAction && owedCards.length === 0
  // Set once the last automatic attempt comes back unrecorded, so the retry offer follows a real failure.
  const [exhaustedSettlement, setExhaustedSettlement] = useState<string | null>(null)
  const emptySettlementRetryNeeded = emptySettlementReady && exhaustedSettlement === emptySettlementKey
  useEffect(() => {
    if (
      !emptySettlementReady ||
      pending ||
      promptMinimized ||
      !claimAutomaticAttempt(attemptedEmptySettlements.current, emptySettlementKey)
    )
      return
    send(
      { kind: 'settle-opponent-turn' },
      {
        background: true,
        complete: (appended) => {
          if (!appended && automaticAttemptsExhausted(attemptedEmptySettlements.current, emptySettlementKey))
            setExhaustedSettlement(emptySettlementKey)
        },
      },
    )
  }, [emptySettlementKey, emptySettlementReady, pending, promptMinimized, send])
  const prompt = settlementRound !== null ? (owedCards.length ? 'owed' : null) : turnPrompt(0, needsDraw || needsDrawAcknowledgement)

  // A phase that ends queues its reminders ahead of the next moment's, so they show in the order they happened.
  const reminderMoment = { ...momentOf(view), turn: reminderTurn }
  const [previousReminderMoment, setPreviousReminderMoment] = useState(reminderMoment)
  if (!sameMoment(previousReminderMoment, reminderMoment) || previousReminderMoment.turn !== reminderMoment.turn) {
    const previous = previousReminderMoment
    setPreviousReminderMoment(reminderMoment)
    if (dismissalsReady && !sameMoment(previous, reminderMoment) && previous.phase !== 'end' && previous.turn) {
      const moment: ReminderTiming = { moment: 'phase-end', phase: previous.phase, turn: previous.turn }
      const context = momentOf(previous)
      const reminders = remindersAt([moment], context)
      if (reminders.length) enqueueReminderPrompt({ reminders, moment: reminderTimingLabel(moment), confirmLabel: 'Dismiss', context })
    }
  }

  useEffect(() => {
    if (!dismissalsReady) return
    const pruned = pruneReminderDismissals(parseReminderDismissals(readStoredValue(dismissalStorageKey)), reminderContext)
    writeStoredValue(dismissalStorageKey, serializeReminderDismissals(pruned))
  }, [dismissalStorageKey, dismissalsReady, reminderContext])

  // The reminders due at this moment of the turn join the queue once no prompt is showing; each is dismissed when shown.
  const momentPrompt = ((): ReminderPrompt | null => {
    if (!reminderTurn) return null
    const context = momentOf(view)
    const firstSide = view.players.find((player) => player.id === view.firstPlayerId)?.side
    const roundMoment = firstSide === undefined || !active ? null : roundReminderMoment(view.phase, active.index, firstSide)
    const roundReminders = roundMoment ? remindersAt([roundMoment], context) : []
    if (roundMoment && roundReminders.length)
      return { reminders: roundReminders, moment: reminderTimingLabel(roundMoment), confirmLabel: 'Dismiss', context }
    const moments: ReminderTiming[] =
      view.phase === 'end'
        ? [{ moment: 'turn-end', phase: null, turn: reminderTurn }]
        : [
            { moment: 'phase-start', phase: view.phase, turn: reminderTurn },
            ...(view.phase === 'command' ? ([{ moment: 'turn-start', phase: null, turn: reminderTurn }] as const) : []),
          ]
    const actionReminders =
      actionRemindersEnabled && view.phase === 'shooting' && reminderTurn === 'your-turn'
        ? activeMissionActionReminders.filter((reminder) => !reminderDismissed(reminder.key, context))
        : EMPTY_REMINDERS
    const reminders = [...remindersAt(moments, context), ...actionReminders]
    if (!reminders.length) return null
    return {
      reminders,
      moment:
        view.phase === 'command'
          ? `${reminderTurn === 'your-turn' ? 'Your' : "Opponent's"} turn · Command phase`
          : reminderTimingLabel(moments[0]!),
      confirmLabel: 'Dismiss',
      context,
    }
  })()
  const momentSignature = momentPrompt && JSON.stringify([momentPrompt.context, momentPrompt.reminders.map((reminder) => reminder.key)])
  const [queuedMoment, setQueuedMoment] = useState<string | null>(null)
  if (dismissalsReady && !reminderPrompt && momentPrompt && momentSignature !== queuedMoment) {
    setQueuedMoment(momentSignature)
    enqueueReminderPrompt(momentPrompt)
  }

  return (
    <BattleMinimizeContext.Provider value={registerMinimized}>
      <main data-battle-tracker className="w-full space-y-3 px-3 pb-32 lg:pb-8">
        {combatSelection ? <BattleCombatDialog view={view} selection={combatSelection} onClose={() => setCombatSelection(null)} /> : null}
        {recordingMissed && missedMoments.length ? (
          <MissedActionDialog
            moments={missedMoments}
            table={table}
            send={send}
            pending={pending}
            problem={problem}
            onClose={() => setRecordingMissed(false)}
          />
        ) : null}
        <div data-battle-sticky-header className="sticky top-(--app-header) z-20 space-y-2 bg-void/95 pb-2 backdrop-blur lg:contents">
          <Scoreboard view={view} clock={clock} sides={table} />
          <GuideHelp task="battle" step="battle-live-score">
            Playing guide
          </GuideHelp>

          {/* Nobody across the table yet means neither a tab nor a column for them. */}
          <Tabs value={focus} onValueChange={(value) => setFocus(value as Focus)} className="battle-focus-tabs lg:hidden">
            <TabsList className={`grid w-full ${oneSided ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <TabsTrigger value="yours">Your side</TabsTrigger>
              <TabsTrigger value="battle">Battle</TabsTrigger>
              {oneSided ? null : <TabsTrigger value="theirs">Opponent</TabsTrigger>}
            </TabsList>
          </Tabs>
        </div>

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
              onSimulate={setCombatSelection}
              coreKeys={coreKeysBySide.get(side.index) ?? EMPTY_KEYS}
              pending={pending || promptMinimized}
              blocked={promptMinimized}
              send={sendAction}
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
            <TurnControl
              view={view}
              clock={clock}
              send={sendAction}
              pending={pending || promptMinimized}
              onAdvance={advance}
              blockReason={promptMinimized ? 'Finish the open prompt to continue.' : blockReason}
              note={view.advancePrompt}
              /*
               * `mb-0` because the column spaces its children with a bottom margin, and
               * a margin on a fixed box sits between it and the edge it is pinned to.
               * At `lg` it is an ordinary box in the column again and takes the gap back.
               */
              className="fixed inset-x-0 bottom-0 z-40 mb-0 border-t border-edge bg-panel/98 px-3 py-2 backdrop-blur lg:static lg:mb-3 lg:rounded-lg lg:border lg:bg-panel lg:p-3 lg:backdrop-filter-none"
            />

            <section className={`space-y-3 rounded-lg border border-edge bg-panel p-3 ${focus === 'battle' ? '' : 'hidden lg:block'}`}>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                {view.settings.manual ? (
                  <Fact label="Tracking" value="Manual" />
                ) : (
                  <>
                    <Fact label="Mission" value={yours?.mission?.name ?? 'Matched play'} />
                    <Fact label="Mission pack" value={missionPack?.name ?? 'Not chosen'} />
                    <BattlefieldFact view={view} deployment={deployment} objectives />
                    <Fact label="Attacker" value={view.players.find((player) => player.id === view.attackerId)?.name ?? 'Not chosen'} />
                  </>
                )}
                <Fact label="Battle size" value={battleSizeText(view) ?? 'Legacy format'} />
                <Fact label="Format" value={formatName(table)} />
                {/*
                 * A twist changes one rule for the whole battle, so it is not enough to
                 * name it: the sentence it changes has to be readable from the table
                 * without leaving the game to go and find the pack.
                 */}
                {twist ? (
                  <div className="min-w-0">
                    <dt className="eyebrow">Twist</dt>
                    <dd>
                      <TwistName twist={twist} />
                    </dd>
                  </div>
                ) : null}
              </dl>
              {view.settings.manual ? <p className="text-xs text-dim">{MANUAL_TRACKING_LIMITS}</p> : null}

              <div data-onboarding="battle-live-report" className="border-t border-edge pt-3">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <p className="eyebrow mr-auto shrink-0">Battle events</p>
                  {isGuestSeat(view.viewerId)
                    ? null
                    : view.players
                        .filter((player) => isGuestSeat(player.id))
                        .map((player) => (
                          <GuestInvite
                            key={player.id}
                            token={view.token}
                            playerId={player.id}
                            name={player.name}
                            joined={!player.automated}
                          />
                        ))}
                  <BattleMenu
                    canDelete={view.creatorId === view.viewerId}
                    pending={pending || promptMinimized || remove.isPending}
                    actionRemindersEnabled={actionRemindersEnabled}
                    timerPaused={clock.paused}
                    onTimerPausedChange={(paused) => sendAction({ kind: paused ? 'pause-clock' : 'resume-clock' })}
                    players={view.players}
                    onActionRemindersChange={view.settings.manual ? undefined : updateActionReminders}
                    onRecordMissed={missedMoments.length ? () => setRecordingMissed(true) : undefined}
                    onConcede={(playerId) => sendAction({ kind: 'end-battle', reason: 'conceded', concededBy: playerId })}
                    onDelete={() => {
                      if (!promptMinimized) remove.mutate()
                    }}
                  />
                </div>
                <div className="mt-3">
                  <BattleNote pending={pending || promptMinimized} send={sendAction} />
                </div>
                <Report token={view.token} players={reportedPlayers} />
              </div>

              {problem ? <Problem>{problem}</Problem> : null}
              {emptySettlementRetryNeeded ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending || promptMinimized}
                  onClick={() => sendAction({ kind: 'settle-opponent-turn' })}
                >
                  Retry finishing the previous turn
                </Button>
              ) : null}
              {remove.error ? <Problem error={remove.error} /> : null}
            </section>
          </div>
        </div>

        {settlementRound === null &&
        !reminderPrompt &&
        !needsDraw &&
        !needsDrawAcknowledgement &&
        view.advanceRequested &&
        !view.scoringAcknowledged &&
        !activeSecretMissionAction &&
        due.length &&
        active &&
        activeScoringDraft ? (
          <ScoringDialog
            key={activeScoringDraft.key}
            initialAnswers={activeScoringDraft.initialAnswers}
            onAnswersChange={activeScoringDraft.onAnswersChange}
            side={active}
            due={due}
            moment={activeScoringMoment}
            confirmLabel={view.phase === 'end' ? 'Pass the turn' : 'End the phase'}
            pending={pending}
            send={send}
            referenceFor={referenceFor}
            round={view.round}
            undo={view}
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
        !reminderPrompt &&
        ((view.advanceRequested && activeSecretMissionAction && !needsDraw && !needsDrawAcknowledgement) ||
          settlementSecretMissionAction) ? (
          <SecretMissionHandoff
            side={secretMissionActionSide}
            pending={pending}
            onCancel={
              activeSecretMissionAction ? () => send({ kind: 'cancel-advance', playerId: secretMissionActionSide.captain.id }) : undefined
            }
            onReveal={() => send({ kind: 'reveal-secret', playerId: secretMissionActionSide.captain.id })}
            undo={view}
            send={send}
          />
        ) : null}

        {!reminderPrompt && prompt === 'owed' && settlementSide && owedScoringDraft && !settlementSecretMissionAction ? (
          <ScoringDialog
            key={owedScoringDraft.key}
            initialAnswers={owedScoringDraft.initialAnswers}
            onAnswersChange={owedScoringDraft.onAnswersChange}
            side={settlementSide}
            due={owedCards}
            moment={view.endOfBattle ? 'end of battle' : 'end of their turn'}
            confirmLabel={view.endOfBattle ? 'Finish battle' : 'Take the turn'}
            pending={pending}
            send={send}
            referenceFor={referenceFor}
            round={settlementRound ?? view.round}
            undo={view}
            onDone={() => send({ kind: 'settle-opponent-turn' })}
          />
        ) : null}

        {settlementRound === null &&
        !reminderPrompt &&
        view.advanceRequested &&
        (view.scoringAcknowledged || !due.length) &&
        view.phase === 'end' &&
        discardable.length &&
        active ? (
          <DiscardSecondaryDialog
            side={active}
            keys={discardable}
            initialSelection={discardDrafts.get(turnDraftKey)}
            onSelectionChange={(selected) => setDiscardDrafts((current) => new Map(current).set(turnDraftKey, selected))}
            pending={pending}
            send={send}
            undo={view}
            onDone={() => {
              send({ kind: 'advance', playerId: active.captain.id })
            }}
          />
        ) : null}

        {!reminderPrompt && prompt === 'draw' && active ? (
          <DrawDialog
            key={turnKey}
            side={active}
            initialSelection={drawDrafts.get(turnDraftKey)}
            onSelectionChange={(selection) => setDrawDrafts((current) => new Map(current).set(turnDraftKey, selection))}
            round={view.round}
            undo={view}
            pending={pending}
            send={send}
            referenceFor={referenceFor}
            whenDrawnFor={whenDrawnFor}
            onDone={() => send({ kind: 'acknowledge-draw', playerId: active.captain.id })}
          />
        ) : null}

        {!reminderPrompt && !prompt && missionChoice ? (
          <MissionSelectionDialog
            key={choiceKey(missionChoice)}
            view={view}
            choice={missionChoice}
            pending={pending}
            send={send}
            reference={referenceFor(missionChoice.cardKey)}
            onClose={() => setSkippedChoices((current) => new Set(current).add(choiceKey(missionChoice)))}
          />
        ) : null}

        {reminderPrompt ? (
          <ReminderDialog
            reminders={reminderPrompt.reminders}
            moment={reminderPrompt.moment}
            confirmLabel={reminderPrompt.confirmLabel}
            onDismiss={(reminder, scope) => {
              const last = reminderPrompt.reminders.length === 1
              rememberReminder(reminder.key, scope, reminderPrompt.context)
              if (last && reminderPrompt.advanceAfterDismissal && sameMoment(reminderPrompt.context, momentOf(view))) advanceNow()
            }}
            onDone={() => {
              for (const reminder of reminderPrompt.reminders) rememberReminder(reminder.key, 'phase', reminderPrompt.context)
              if (reminderPrompt.advanceAfterDismissal && sameMoment(reminderPrompt.context, momentOf(view))) advanceNow()
            }}
          />
        ) : null}
      </main>
    </BattleMinimizeContext.Provider>
  )
}

const discardableSecondaries = (side: Side) =>
  side.secondaryMode === 'tactical'
    ? side.secondaries.filter((card) => !card.secret && card.status === 'active').map((card) => card.key)
    : []

/** The shape of the table only: a seat nobody signs in to is already named for what it is. */
function formatName(table: Side[]) {
  return table
    .map((side) => side.armies.length)
    .toSorted((left, right) => right - left)
    .join('v')
}

/** The cards a side was holding, as keys, so a later hand can be told from this one. */
const heldKeys = (side: Side | undefined) => (side?.secondaries ?? []).filter((card) => card.status === 'active').map((card) => card.key)
