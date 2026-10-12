import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Choice } from '../../components/Choice'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { SearchableSelect } from '../../components/SearchableSelect'
import { saveJournalGame } from '../../functions'
import { factionIndexQuery, journalQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { factionSelectGroups } from '../rosters/builder/factions'
import {
  JOURNAL_ARMY_MAX_LENGTH,
  JOURNAL_NOTE_MAX_LENGTH,
  JOURNAL_SCORE_MAX,
  scoredResult,
  type JournalGameInput,
  type JournalResult,
} from '../../../core/gameJournal'
import { PROFILE_NAME_MAX_LENGTH } from '../../../core/profileName'
import { currentCatalogueFamilyId } from '../../../core/retiredCatalogueIds'

export type JournalGame = Awaited<ReturnType<NonNullable<ReturnType<typeof journalQuery>['queryFn']>>>['games'][number]

const NO_FACTION = ''
const RESULT_NAMES: Record<JournalResult, string> = { won: 'Won', drawn: 'Drew', lost: 'Lost' }

/** Today's calendar day where the player is, which is the day they mean. */
function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function draftOf(game: JournalGame | null, eventId: string | null): JournalGameInput {
  return game
    ? {
        id: game.id,
        eventId: game.eventId,
        playedOn: game.playedOn,
        factionId: game.factionId,
        army: game.army,
        opponentName: game.opponentName,
        opponentFactionId: game.opponentFactionId,
        score: game.score,
        opponentScore: game.opponentScore,
        result: game.result,
        notes: game.notes,
      }
    : {
        // Chosen once per dialog, so a save sent twice records one game.
        id: crypto.randomUUID(),
        eventId,
        playedOn: today(),
        factionId: null,
        army: null,
        opponentName: null,
        opponentFactionId: null,
        score: null,
        opponentScore: null,
        result: 'won',
        notes: null,
      }
}

const scoreOf = (value: string) => (value === '' ? null : Math.max(0, Math.min(JOURNAL_SCORE_MAX, Math.trunc(Number(value)))))

export function JournalGameDialog({
  open,
  game,
  eventId = null,
  events,
  onClose,
}: {
  open: boolean
  /** The game to edit, or null to record a new one. */
  game: JournalGame | null
  /** The event a new game starts in. */
  eventId?: string | null
  events: readonly { id: string; name: string }[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(() => draftOf(game, eventId))
  const { data: index } = useQuery(factionIndexQuery())
  const groups = useMemo(
    () => [
      { label: 'Faction', items: [{ label: 'Not recorded', value: NO_FACTION }] },
      ...factionSelectGroups(index?.factions.filter((entry) => entry.isDefault) ?? [], new Set()),
    ],
    [index],
  )
  const optionFor = (factionId: string | null) =>
    factionId === null
      ? NO_FACTION
      : (index?.factions.find((entry) => entry.isDefault && currentCatalogueFamilyId(entry.id) === factionId)?.id ?? NO_FACTION)
  const familyOf = (value: string) => (value === NO_FACTION ? null : currentCatalogueFamilyId(value))
  const scored = scoredResult(draft.score, draft.opponentScore)
  const change = (next: Partial<JournalGameInput>) =>
    setDraft((current) => {
      const merged = { ...current, ...next }
      return { ...merged, result: scoredResult(merged.score, merged.opponentScore) ?? merged.result }
    })
  const save = useMutation({
    mutationFn: () => saveJournalGame({ data: draft }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: journalQuery().queryKey })
      onClose()
    },
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !save.isPending && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{game ? 'Edit game' : 'Record a game'}</DialogTitle>
          <DialogDescription>A game you played away from Praetorium, as you remember it. Only you can see it.</DialogDescription>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="eyebrow block" htmlFor="journal-played-on">
                  Played on
                </Label>
                <Input
                  id="journal-played-on"
                  type="date"
                  required
                  max={today()}
                  value={draft.playedOn}
                  onChange={(event) => change({ playedOn: event.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="eyebrow block" htmlFor="journal-event">
                  Event
                </Label>
                <Select value={draft.eventId ?? ''} onValueChange={(value) => change({ eventId: value || null })}>
                  <SelectTrigger id="journal-event" className="mt-1 w-full">
                    <SelectValue>{(value: unknown) => events.find((entry) => entry.id === value)?.name ?? 'Not in an event'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Not in an event</SelectItem>
                    {events.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="eyebrow block" htmlFor="journal-faction">
                  Your faction
                </Label>
                <SearchableSelect
                  id="journal-faction"
                  groups={groups}
                  value={optionFor(draft.factionId)}
                  onValueChange={(value) => change({ factionId: familyOf(value) })}
                  placeholder="Not recorded"
                  searchPlaceholder="Search factions…"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="eyebrow block" htmlFor="journal-army">
                  Your army
                </Label>
                <Input
                  id="journal-army"
                  maxLength={JOURNAL_ARMY_MAX_LENGTH}
                  placeholder="Optional"
                  value={draft.army ?? ''}
                  onChange={(event) => change({ army: event.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="eyebrow block" htmlFor="journal-opponent">
                  Opponent
                </Label>
                <Input
                  id="journal-opponent"
                  maxLength={PROFILE_NAME_MAX_LENGTH}
                  placeholder="Optional"
                  value={draft.opponentName ?? ''}
                  onChange={(event) => change({ opponentName: event.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="eyebrow block" htmlFor="journal-opponent-faction">
                  Opponent’s faction
                </Label>
                <SearchableSelect
                  id="journal-opponent-faction"
                  groups={groups}
                  value={optionFor(draft.opponentFactionId)}
                  onValueChange={(value) => change({ opponentFactionId: familyOf(value) })}
                  placeholder="Not recorded"
                  searchPlaceholder="Search factions…"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="eyebrow block" htmlFor="journal-score">
                  Your victory points
                </Label>
                <Input
                  id="journal-score"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={JOURNAL_SCORE_MAX}
                  placeholder="Optional"
                  value={draft.score ?? ''}
                  onChange={(event) => change({ score: scoreOf(event.target.value) })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="eyebrow block" htmlFor="journal-opponent-score">
                  Opponent’s victory points
                </Label>
                <Input
                  id="journal-opponent-score"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={JOURNAL_SCORE_MAX}
                  placeholder="Optional"
                  value={draft.opponentScore ?? ''}
                  onChange={(event) => change({ opponentScore: scoreOf(event.target.value) })}
                  className="mt-1"
                />
              </div>
            </div>
            <Choice
              label="Result"
              value={draft.result}
              columns={3}
              disabled={scored !== null}
              options={(['won', 'drawn', 'lost'] as const).map((value) => ({ value, name: RESULT_NAMES[value] }))}
              onChange={(result) => change({ result })}
            />
            {scored !== null ? <p className="-mt-2 text-xs text-dim">The scores decide the result.</p> : null}
            <div>
              <Label className="eyebrow block" htmlFor="journal-notes">
                Notes
              </Label>
              <Textarea
                id="journal-notes"
                maxLength={JOURNAL_NOTE_MAX_LENGTH}
                placeholder="Mission, key moments, what to try next time"
                value={draft.notes ?? ''}
                onChange={(event) => change({ notes: event.target.value })}
                className="mt-1"
              />
            </div>
            {save.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(save.error, 'Could not save the game. Try again.')}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {game ? 'Save changes' : 'Record game'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
