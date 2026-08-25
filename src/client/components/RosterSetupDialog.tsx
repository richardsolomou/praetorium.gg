import { useQuery } from '@tanstack/react-query'
import { Check, Layers3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  detachmentLimit,
  detachmentPointsError,
  detachmentPointBudget,
  GAME_SIZES,
  isKotcLimit,
  ROSTER_NAME_MAX_LENGTH,
} from '../../core/battle'
import type { RosterVisibility } from '../../core/savedRoster'
import { factionQuery } from '../queries'
import { DetachmentReference } from './DetachmentReference'
import { SearchableSelect, type SearchableGroup } from './SearchableSelect'
import { factionSelectGroups } from './builder/factions'
import { dispositionsFor, dispositionTone } from './rosterSetup'
import { useFavouriteFactions } from '../favouriteFactions'
import { favouriteDetachmentsFirst, useFavouriteDetachments } from '../favouriteDetachments'
import { FavouriteDetachmentToggle } from './FavouriteDetachmentToggle'

type Detachment = {
  id: string
  slug: string
  name: string
  dispositions: readonly { id: string; name: string }[]
  reference?: { points: number | null } | null
}

export type RosterSetupFaction = {
  id: string
  slug: string
  name: string
  displayName: string
  icon: string | null
  detachments: Detachment[]
}

export type RosterSetupFactionOption = Omit<RosterSetupFaction, 'detachments'>

export type RosterSetup = {
  name: string
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  visibility: RosterVisibility
}

type Props = {
  open: boolean
  mode?: 'create' | 'edit'
  onOpenChange: (open: boolean) => void
  factionOptions: RosterSetupFactionOption[]
  initialFaction?: RosterSetupFaction | null
  value: RosterSetup
  onDraftChange?: (value: RosterSetup) => void
  hasUnits: boolean
  onSave: (value: RosterSetup) => void
  pending?: boolean
}

const BATTLE_SIZE_GROUPS: SearchableGroup[] = [
  {
    label: '',
    items: GAME_SIZES.map((size) => ({ label: `${size.name} · ${size.limit} points`, value: String(size.limit) })),
  },
]

export function RosterSetupDialog({
  open,
  mode = 'edit',
  onOpenChange,
  factionOptions,
  initialFaction,
  value,
  onDraftChange,
  hasUnits,
  onSave,
  pending = false,
}: Props) {
  const [draft, setDraft] = useState(value)
  const [reference, setReference] = useState<{ catalogueId: string; detachmentId: string; slug: string; name: string } | null>(null)
  const { favourites } = useFavouriteFactions()
  const { favourites: favouriteDetachments } = useFavouriteDetachments()
  const { data: loadedFaction } = useQuery({
    ...factionQuery(draft.catalogueId),
    enabled: open && Boolean(draft.catalogueId) && initialFaction?.id !== draft.catalogueId,
  })
  const faction = loadedFaction ?? (initialFaction?.id === draft.catalogueId ? initialFaction : null)

  useEffect(() => {
    if (!reference) return
    const reset = () => document.getElementById('detachment-reference-dialog')?.scrollTo({ top: 0 })
    reset()
    requestAnimationFrame(reset)
  }, [reference])

  const changeDraft = (next: RosterSetup) => {
    setDraft(next)
    onDraftChange?.(next)
  }

  const loadingFaction = Boolean(draft.catalogueId && !faction)
  const selected = faction?.detachments.filter((detachment) => draft.detachmentIds.includes(detachment.id)) ?? []
  const dispositions = dispositionsFor(faction?.detachments ?? [], draft.detachmentIds)
  const selectedDisposition = dispositions.length === 1 ? (dispositions[0]?.id ?? null) : draft.disposition
  const spent = selected.reduce((sum, detachment) => sum + (detachment.reference?.points ?? 0), 0)
  const allowance = detachmentPointBudget(draft.limit)
  const pointsError = detachmentPointsError(
    selected.map((detachment) => ({ points: detachment.reference?.points ?? null })),
    allowance,
  )
  const availableDetachments = favouriteDetachmentsFirst(
    faction?.detachments.filter((detachment) => {
      if (draft.detachmentIds.includes(detachment.id)) return true
      if (draft.detachmentIds.length >= detachmentLimit(draft.limit) && !isKotcLimit(draft.limit)) return false
      if (!selected.length || allowance === null || detachment.reference?.points == null) return true
      return spent + detachment.reference.points <= allowance
    }) ?? [],
    faction?.id ?? '',
    favouriteDetachments,
  )
  const factionChanged = value.catalogueId !== draft.catalogueId
  const detachmentsChanged = value.detachmentIds.toSorted().join() !== draft.detachmentIds.toSorted().join()
  const groups = factionSelectGroups(factionOptions, favourites)

  const toggleDetachment = (id: string) => {
    const ids = draft.detachmentIds.includes(id)
      ? draft.detachmentIds.filter((candidate) => candidate !== id)
      : isKotcLimit(draft.limit)
        ? [id]
        : [...draft.detachmentIds, id].slice(0, detachmentLimit(draft.limit))
    const offered = dispositionsFor(faction?.detachments ?? [], ids)
    changeDraft({
      ...draft,
      name:
        mode === 'create'
          ? [faction?.displayName, ...ids.map((selectedId) => faction?.detachments.find((entry) => entry.id === selectedId)?.name)]
              .filter(Boolean)
              .join(' — ')
          : draft.name,
      detachmentIds: ids,
      disposition:
        offered.length === 1
          ? (offered[0]?.id ?? null)
          : offered.some((entry) => entry.id === draft.disposition)
            ? draft.disposition
            : null,
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-none border border-edge bg-panel p-0 text-bone ring-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-edge px-5 py-4">
            <DialogTitle className="text-2xl uppercase">{mode === 'create' ? 'Create roster' : 'Edit roster setup'}</DialogTitle>
            <DialogDescription className="text-dim">
              {mode === 'create'
                ? 'Set the roster identity and army rules before adding units.'
                : 'Set the roster identity and the rules that shape its available units.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="eyebrow block" htmlFor="setup-faction">
                  Faction
                </Label>
                <SearchableSelect
                  id="setup-faction"
                  groups={groups}
                  value={draft.catalogueId}
                  onValueChange={(catalogueId) => {
                    const nextFaction = factionOptions.find((entry) => entry.id === catalogueId)
                    changeDraft({
                      ...draft,
                      name: mode === 'create' ? (nextFaction?.displayName ?? '') : draft.name,
                      catalogueId,
                      detachmentIds: [],
                      disposition: null,
                    })
                  }}
                  placeholder="Pick a faction"
                  searchPlaceholder="Search factions…"
                  className="mt-1 h-11 rounded-none border-edge bg-sunken font-semibold uppercase"
                />
              </div>
              <div>
                <Label className="eyebrow block" htmlFor="setup-size">
                  Battle size
                </Label>
                <SearchableSelect
                  id="setup-size"
                  ariaLabel="Battle size"
                  value={String(draft.limit)}
                  groups={BATTLE_SIZE_GROUPS}
                  onValueChange={(next) => {
                    const limit = Number(next)
                    changeDraft({
                      ...draft,
                      limit,
                      detachmentIds: draft.detachmentIds.slice(0, detachmentLimit(limit)),
                      disposition: null,
                    })
                  }}
                  placeholder="Battle size"
                  className="mt-1 h-11 rounded-none border-edge bg-sunken font-semibold uppercase"
                />
              </div>
            </div>

            <fieldset>
              <div className="flex items-end justify-between gap-3">
                <legend className="rubric">Detachments</legend>
                <span className={`readout text-xs ${pointsError ? 'text-destructive' : 'text-dim'}`}>
                  {spent}
                  {allowance === null ? '' : `/${allowance}`} DP used
                </span>
              </div>
              <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                {availableDetachments.map((detachment) => {
                  const chosen = draft.detachmentIds.includes(detachment.id)
                  return (
                    <div
                      key={detachment.id}
                      className={`flex min-h-20 items-stretch rounded-none border ${chosen ? 'border-parchment bg-raised' : 'border-edge bg-sunken'}`}
                    >
                      <div className="flex w-10 shrink-0 flex-col border-r border-edge">
                        <button
                          type="button"
                          aria-label={`View ${detachment.name} detachment reference`}
                          className="grid min-h-10 flex-1 place-items-center hover:bg-raised"
                          onClick={() => {
                            if (!faction) return
                            setReference({
                              catalogueId: faction.id,
                              detachmentId: detachment.id,
                              slug: detachment.slug,
                              name: detachment.name,
                            })
                          }}
                        >
                          <Layers3 className={`size-4 ${chosen ? 'text-parchment' : 'text-faint'}`} />
                        </button>
                        {faction ? (
                          <FavouriteDetachmentToggle
                            catalogueId={faction.id}
                            detachmentId={detachment.id}
                            name={detachment.name}
                            className="size-10 border-t border-edge hover:bg-raised"
                          />
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label={`View ${detachment.name} detachment reference`}
                        className="flex min-w-0 flex-1 items-start p-3 text-left"
                        onClick={() => {
                          if (!faction) return
                          setReference({
                            catalogueId: faction.id,
                            detachmentId: detachment.id,
                            slug: detachment.slug,
                            name: detachment.name,
                          })
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold uppercase">{detachment.name}</span>
                          <span className="mt-2 flex flex-wrap gap-1">
                            {detachment.dispositions.map((entry) => (
                              <span key={entry.id} className={`chip ${dispositionTone(entry.id)}`}>
                                {entry.name}
                              </span>
                            ))}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`${chosen ? 'Remove' : 'Select'} ${detachment.name}`}
                        onClick={() => toggleDetachment(detachment.id)}
                        className={`grid w-20 shrink-0 place-items-center border-l border-edge text-sm font-bold uppercase ${chosen ? 'bg-parchment text-parchment-ink' : 'bg-raised text-azure hover:bg-azure/15'}`}
                      >
                        {detachment.reference?.points ?? '—'} DP
                      </button>
                    </div>
                  )
                })}
              </div>
              {pointsError ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {pointsError}
                </p>
              ) : null}
            </fieldset>

            {dispositions.length ? (
              <fieldset>
                <legend className="rubric">Force disposition</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {dispositions.map((entry) => {
                    const chosen = selectedDisposition === entry.id
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          if (dispositions.length > 1) changeDraft({ ...draft, disposition: entry.id })
                        }}
                        className={`flex min-h-12 items-center justify-between border px-3 text-left font-bold uppercase ${dispositionTone(entry.id, chosen)}`}
                      >
                        {entry.name}
                        <span
                          className={`grid size-6 place-items-center rounded-full border ${chosen ? 'border-current bg-bone text-void' : 'border-current/60'}`}
                        >
                          {chosen ? <Check className="size-4" /> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ) : null}

            <div>
              <Label className="rubric block" htmlFor="setup-name">
                Roster name
              </Label>
              <Input
                id="setup-name"
                value={draft.name}
                onChange={(event) => changeDraft({ ...draft, name: event.target.value })}
                maxLength={ROSTER_NAME_MAX_LENGTH}
                className="mt-2 h-11 rounded-none border-edge bg-sunken text-base"
              />
            </div>

            <div>
              <Label className="rubric block" htmlFor="setup-visibility">
                Access
              </Label>
              <Select
                value={draft.visibility}
                onValueChange={(visibility: RosterVisibility | null) => changeDraft({ ...draft, visibility: visibility ?? 'private' })}
              >
                <SelectTrigger id="setup-visibility" className="mt-2 h-11 w-full rounded-none border-edge bg-sunken">
                  <SelectValue>
                    {(visibility: unknown) => (visibility === 'unlisted' ? 'Unlisted — anyone with the link' : 'Private — only you')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private — only you</SelectItem>
                  <SelectItem value="unlisted">Unlisted — anyone with the link</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasUnits && (factionChanged || detachmentsChanged) ? (
              <p className="border border-discarded/60 bg-discarded/10 p-3 text-sm text-discarded">
                {factionChanged
                  ? 'Changing faction removes this roster’s units.'
                  : 'Changing detachments may make existing enhancements unavailable.'}
              </p>
            ) : null}
          </div>

          <DialogFooter className="m-0 rounded-none border-edge bg-sunken px-5 py-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="sm:min-w-40"
              disabled={
                pending ||
                loadingFaction ||
                !draft.name.trim() ||
                !draft.catalogueId ||
                !draft.detachmentIds.length ||
                (dispositions.length > 1 && !selectedDisposition) ||
                Boolean(pointsError)
              }
              onClick={() => onSave({ ...draft, name: draft.name.trim(), disposition: selectedDisposition })}
            >
              {loadingFaction
                ? 'Loading faction…'
                : pending
                  ? mode === 'create'
                    ? 'Creating…'
                    : 'Saving…'
                  : mode === 'create'
                    ? 'Create roster'
                    : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(reference)} onOpenChange={(next) => !next && setReference(null)}>
        <DialogContent
          id="detachment-reference-dialog"
          initialFocus={false}
          className="rounded-none border border-edge bg-panel p-0 text-bone ring-0 sm:max-w-5xl"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{reference?.name ?? 'Detachment reference'}</DialogTitle>
            <DialogDescription>Detachment rules, enhancements, and stratagems.</DialogDescription>
          </DialogHeader>
          <div className="p-5">
            {reference ? (
              <DetachmentReference
                catalogueId={reference.catalogueId}
                detachmentId={reference.detachmentId}
                slug={reference.slug}
                faction={faction?.id === reference.catalogueId ? faction : undefined}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
