import { queryOptions, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useCallback, useEffect, useRef, useState } from 'react'
import { saveScoringDraft, scoringDrafts } from '../../functions'
import { scoringDraftsKey } from '../../queries/queryKeys'
import { parseStored, readStoredValue, writeStoredValue } from '../../storedValue'
import type { BattleView } from '../../../core/battleView'
import { scoringDraftSchema, scoringMoment } from '../../../core/scoringDraft'
import type { ScoringAnswers } from './ScoringDialog'

/** How long after the last press the answers are sent, so a run of presses is one write. */
const SAVE_DELAY_MS = 600

// Read afresh each time a prompt opens; offline there is nothing to wait for, so no retries.
const scoringDraftsQuery = (token: string, enabled: boolean) =>
  queryOptions({ queryKey: scoringDraftsKey(token), queryFn: () => scoringDrafts({ data: { token } }), enabled, retry: false })

/** This device's copy of a draft, with when the service accepted it; without one it is still to send. */
const storedDraftSchema = scoringDraftSchema.extend({ savedAt: z.number().int().optional() })
type StoredDraft = z.infer<typeof storedDraftSchema>

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
 * The answers pressed so far on each side's scoring prompt, shared by every seated phone: whichever pressed last wins.
 *
 * A press here is kept in browser storage at once and sent a moment later, so it survives leaving the battle and a lost
 * connection, and it shows here until a later press from another phone reaches this one. Everything is dropped as soon
 * as the battle leaves the moment it was pressed for.
 */
export function useScoringDrafts(view: BattleView) {
  const viewerId = view.players.some((player) => player.isViewer) ? view.viewerId : null
  const moment = viewScoringMoment(view)
  const key = viewerId ? storageKey(viewerId, view.token) : null
  // Only while a scoring prompt can be open, so the commands of the rest of the game fetch nothing.
  const prompting = moment !== null && (view.advanceRequested || view.settlementPlayerId !== null)
  const synced = useQuery(scoringDraftsQuery(view.token, Boolean(viewerId) && prompting))
  const [local, setLocal] = useState<StoredDraft | null>(() => (key ? parseStored(storedDraftSchema, readStoredValue(key)) : null))
  // A moment left takes this device's presses with it, even when an undo comes back to an identical one.
  const [localMoment, setLocalMoment] = useState(moment)
  if (localMoment !== moment) {
    setLocalMoment(moment)
    setLocal(null)
  }
  const timer = useRef<number | undefined>(undefined)
  const sending = useRef(false)

  const flush = useCallback(
    async function flush() {
      window.clearTimeout(timer.current)
      if (!key || sending.current) return
      const stored = readStoredValue(key)
      const draft = parseStored(storedDraftSchema, stored)
      if (!draft || draft.savedAt !== undefined) return
      sending.current = true
      try {
        const result = await saveScoringDraft({
          data: { token: view.token, draft: { moment: draft.moment, playerId: draft.playerId, answers: draft.answers } },
        })
        // A press while this was on its way is still to send; otherwise this copy now stands for what the service holds.
        if (readStoredValue(key) !== stored) timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
        else if (result.outcome === 'saved') {
          const saved = { ...draft, savedAt: result.updatedAt }
          writeStoredValue(key, JSON.stringify(saved))
          setLocal(saved)
        }
      } catch {
        // Offline or refused: the answers stay stored and go with the next reconnect or press.
      } finally {
        sending.current = false
      }
    },
    [key, view.token],
  )

  // Presses kept for a moment the battle has since left are dropped rather than sent late; the rest go now.
  useEffect(() => {
    if (!key) return
    const stored = parseStored(storedDraftSchema, readStoredValue(key))
    if (stored && stored.moment !== moment) writeStoredValue(key, null)
    else if (stored) timer.current = window.setTimeout(() => void flush(), 0)
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
      setLocal(draft)
      writeStoredValue(key, JSON.stringify(draft))
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
    },
    [flush, key, moment],
  )

  const answers = (playerId: string): ScoringAnswers | undefined => {
    const shared = synced.data?.find((draft) => draft.moment === moment && draft.playerId === playerId)
    const own = local?.moment === moment && local.playerId === playerId ? local : null
    if (own && (!shared || own.savedAt === undefined || shared.updatedAt <= own.savedAt)) return own.answers
    return shared?.answers
  }
  return { answers, save }
}
