import { queryOptions, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { saveScoringDraft, scoringDrafts } from '../../functions'
import { scoringDraftsKey } from '../../queries/queryKeys'
import { parseStored, readStoredValue, writeStoredValue } from '../../storedValue'
import type { BattleView } from '../../../core/battleView'
import { type ScoringDraft, scoringDraftSchema, scoringMoment } from '../../../core/scoringDraft'
import type { ScoringAnswers } from './ScoringDialog'

/** How long after the last press the answers are sent, so a run of presses is one write. */
const SAVE_DELAY_MS = 600

// Read afresh each time a prompt opens; offline there is nothing to wait for, so no retries.
const scoringDraftsQuery = (token: string, enabled: boolean) =>
  queryOptions({ queryKey: scoringDraftsKey(token), queryFn: () => scoringDrafts({ data: { token } }), enabled, retry: false })

/** Another player's unconfirmed answers to the prompt this device has open. */
export type PeerAnswers = { userId: string; name: string; answers: ScoringAnswers }

const storageKey = (viewerId: string, token: string) => `praetorium:scoring-draft:${viewerId}:${token}`

const viewScoringMoment = (view: BattleView) =>
  scoringMoment({
    status: view.status,
    momentSeq: view.momentSeq,
    activePlayerId: view.activePlayerId,
    phase: view.phase,
    scoringAcknowledged: view.scoringAcknowledged,
    pendingSettlement: view.settlementPlayerId === null ? null : { playerId: view.settlementPlayerId },
  })

/**
 * The scoring answers each seated player has pressed and not yet confirmed.
 *
 * This device's own answers are kept in browser storage at once and sent a moment after the last press, so they
 * survive leaving the battle and a lost connection; they are dropped as soon as the battle leaves their moment.
 */
export function useScoringDrafts(view: BattleView) {
  const viewerId = view.players.some((player) => player.isViewer) ? view.viewerId : null
  const moment = viewScoringMoment(view)
  const key = viewerId ? storageKey(viewerId, view.token) : null
  // Only while a scoring prompt can be open, so the commands of the rest of the game fetch nothing.
  const prompting = moment !== null && (view.advanceRequested || view.settlementPlayerId !== null)
  const synced = useQuery(scoringDraftsQuery(view.token, Boolean(viewerId) && prompting))
  const [own, setOwn] = useState<ScoringDraft | null>(() => (key ? parseStored(scoringDraftSchema, readStoredValue(key)) : null))
  // A moment left takes this device's answers with it, even when an undo comes back to an identical one.
  const [ownMoment, setOwnMoment] = useState(moment)
  if (ownMoment !== moment) {
    setOwnMoment(moment)
    setOwn(null)
  }
  // A face-down card is the one thing hidden from the other side, so its answer stays on this device.
  const hiddenKeys = JSON.stringify(
    view.players.flatMap((player) => player.secondaries.filter((card) => card.secret && !card.revealed).map((card) => card.key)),
  )
  const hidden = useMemo(() => new Set(JSON.parse(hiddenKeys) as string[]), [hiddenKeys])
  const timer = useRef<number | undefined>(undefined)
  const sending = useRef(false)
  // What was last accepted, so the stored copy can stay as the full answers without being sent again.
  const sent = useRef<string | null>(null)

  const flush = useCallback(
    async function flush() {
      window.clearTimeout(timer.current)
      if (!key || sending.current) return
      const stored = readStoredValue(key)
      const draft = parseStored(scoringDraftSchema, stored)
      if (!draft) return
      const payload = JSON.stringify({
        ...draft,
        answers: Object.fromEntries(Object.entries(draft.answers).filter(([card]) => !hidden.has(card))),
      })
      if (payload === sent.current) return
      sending.current = true
      try {
        await saveScoringDraft({ data: { token: view.token, draft: scoringDraftSchema.parse(JSON.parse(payload)) } })
        sent.current = payload
        // A press while this was on its way is still to send.
        if (readStoredValue(key) !== stored) timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
      } catch {
        // Offline or refused: the answers stay stored and go with the next reconnect or press.
      } finally {
        sending.current = false
      }
    },
    [hidden, key, view.token],
  )

  // Answers kept for a moment the battle has since left are dropped rather than sent late; the rest go now.
  useEffect(() => {
    if (!key) return
    const stored = parseStored(scoringDraftSchema, readStoredValue(key))
    if (stored && stored.moment !== moment) writeStoredValue(key, null)
    else if (stored) void flush()
  }, [flush, key, moment])

  useEffect(() => {
    const online = () => void flush()
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('online', online)
      window.clearTimeout(timer.current)
    }
  }, [flush])

  const save = useCallback(
    (playerId: string, answers: ScoringAnswers) => {
      if (!key || !moment) return
      const draft = { moment, playerId, answers }
      setOwn(draft)
      writeStoredValue(key, JSON.stringify(draft))
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
    },
    [flush, key, moment],
  )

  const current = (synced.data ?? []).filter((draft) => draft.moment === moment)
  return {
    ownAnswers: (playerId: string): ScoringAnswers | undefined =>
      own?.moment === moment && own.playerId === playerId
        ? own.answers
        : current.find((draft) => draft.userId === viewerId && draft.playerId === playerId)?.answers,
    peerAnswers: (playerId: string): PeerAnswers[] =>
      current.flatMap((draft) =>
        draft.userId !== viewerId && draft.playerId === playerId && Object.keys(draft.answers).length
          ? [
              {
                userId: draft.userId,
                name: view.players.find((player) => player.id === draft.userId)?.name ?? 'Another player',
                answers: draft.answers,
              },
            ]
          : [],
      ),
    save,
  }
}
