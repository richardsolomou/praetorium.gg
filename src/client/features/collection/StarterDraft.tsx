import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Wand2 } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { pointsBudgetOf } from '../../../core/battle'
import { DEFAULT_PLAYER_DEFAULTS } from '../../../core/playerDefaults'
import type { RosterPick } from '../../../core/roster'
import { fitStarterBudget, starterPicks, type LeftOut, type StarterCandidate } from '../../../core/starterDraft'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { priceRoster } from '../../functions'
import { playerDefaultsQuery, unitsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { defaultWarlord } from '../rosters/builder/usePicks'
import { EMPTY_SETUP } from '../rosters/guestDraft'
import { useNewRoster } from '../rosters/newRoster'
import { RosterSetupDialog, type RosterSetup, type RosterSetupFactionOption } from '../rosters/RosterSetupDialog'

/** The pricing request takes at most this many units. */
const PRICED_UNITS = 100

type Priced = NonNullable<Awaited<ReturnType<typeof priceRoster>>>

/** Each pick's priced unit by position, absent for a pick the catalogue cannot build. */
async function priceUnits(setup: RosterSetup, picks: readonly RosterPick[]) {
  const units: (Priced['units'][number] | undefined)[] = Array.from({ length: picks.length })
  for (let start = 0; start < picks.length; start += PRICED_UNITS) {
    const priced = await priceRoster({ data: priceInput(setup, picks.slice(start, start + PRICED_UNITS)) })
    if (!priced) throw new Error('This army’s rules are not available right now. Try again when you are online.')
    for (const unit of priced.units) units[start + unit.key] = unit
  }
  return units
}

const priceInput = (setup: RosterSetup, units: readonly RosterPick[]) => ({
  catalogueId: setup.catalogueId,
  detachmentIds: setup.detachmentIds,
  disposition: setup.disposition,
  borrowedDetachmentId: setup.borrowedDetachmentId,
  limit: setup.limit,
  units: [...units],
  waivedRules: setup.waivedRules,
  optionalRules: setup.optionalRules,
})

/**
 * Sizes, copy limits and points all come from pricing the owned units the way the builder
 * would, so the draft can only choose among answers the builder already gives.
 */
export async function draftStarter(
  setup: RosterSetup,
  counts: Readonly<Record<string, number>>,
  fetchUnits: () => Promise<{ id: string; name: string; limit: number | null; allied: boolean }[]>,
) {
  const owned = (await fetchUnits()).filter((unit) => !unit.allied && counts[unit.id])
  const sized = await priceUnits(
    setup,
    owned.map((unit) => ({ entryId: unit.id })),
  )
  const candidates = owned.flatMap((unit, index): StarterCandidate[] => {
    const size = sized[index]?.size
    return size ? [{ entryId: unit.id, name: unit.name, owned: counts[unit.id]!, size, limit: unit.limit }] : []
  })
  const planned = starterPicks(candidates)
  const pricedPicks = await priceUnits(
    setup,
    planned.picks.map((pick) => ({ entryId: pick.entryId, models: pick.models })),
  )
  const fitted = fitStarterBudget(
    planned.picks.flatMap((pick, index) => {
      const unit = pricedPicks[index]
      return unit ? [{ ...pick, points: unit.points, warlord: unit.toggles.some((toggle) => toggle.name === 'Warlord') }] : []
    }),
    pointsBudgetOf(setup),
  )
  const picks: RosterPick[] = fitted.chosen.map((pick) => ({ entryId: pick.entryId, models: pick.models }))
  const chosenUnits = picks.length ? await priceUnits(setup, picks) : []
  const warlord = defaultWarlord(
    picks.map((pick, key) => ({ ...pick, key })),
    chosenUnits,
  )
  if (warlord) picks[warlord.index] = { ...picks[warlord.index]!, toggles: { [warlord.toggle]: 1 } }
  const verdict = picks.length ? await priceRoster({ data: priceInput(setup, picks) }) : null
  const leftOut = new Map<string, LeftOut>()
  for (const item of [...planned.leftOut, ...fitted.leftOut]) {
    const key = `${item.entryId}:${item.reason}`
    leftOut.set(key, { ...item, models: (leftOut.get(key)?.models ?? 0) + item.models })
  }
  return {
    setup,
    picks,
    units: fitted.chosen.map((pick, index) => ({
      key: `${pick.entryId}:${pick.copy}`,
      name: pick.name,
      models: pick.models,
      warlord: Boolean(picks[index]!.toggles),
    })),
    points: verdict?.points ?? 0,
    budget: pointsBudgetOf(setup),
    leftOut: [...leftOut].map(([key, item]) => ({ key, ...item })),
    problems: verdict
      ? [
          verdict.detachmentError,
          verdict.dispositionError,
          ...verdict.errors.map((error) => `${error.entryName}: ${error.message}`),
        ].filter((problem): problem is string => Boolean(problem))
      : [],
    owned: owned.length,
  }
}

type Draft = Awaited<ReturnType<typeof draftStarter>>

const REASONS: Record<LeftOut['reason'], (models: number) => string> = {
  'too-few': (models) => `${models} owned ${models === 1 ? 'model is' : 'models are'} fewer than its smallest unit`,
  limit: (models) => `${models} more ${models === 1 ? 'model' : 'models'} than this battle size allows copies for`,
  points: () => 'No room left in the points budget',
}

export function StarterDraft({
  factionOptions,
  counts,
}: {
  factionOptions: RosterSetupFactionOption[]
  counts: Readonly<Record<string, number>>
}) {
  const queryClient = useQueryClient()
  const { data: defaults = DEFAULT_PLAYER_DEFAULTS } = useQuery(playerDefaultsQuery())
  const [setupOpen, setSetupOpen] = useState(false)
  const create = useNewRoster()
  const draft = useMutation({
    mutationFn: (setup: RosterSetup) =>
      draftStarter(setup, counts, () =>
        queryClient.query(unitsQuery(setup.catalogueId, setup.limit, setup.waivedRules, setup.detachmentIds)),
      ),
    onSuccess: (result) =>
      posthog.capture('starter_draft_built', {
        units: result.picks.length,
        left_out: result.leftOut.length,
        problems: result.problems.length,
      }),
  })
  const initial = { ...EMPTY_SETUP, visibility: defaults.rosterVisibility, limit: defaults.battleSize }
  return (
    <>
      <Button variant="outline" size="sm" disabled={!factionOptions.length} onClick={() => setSetupOpen(true)}>
        <Wand2 /> Draft an army
      </Button>
      <RosterSetupDialog
        key={`${initial.visibility}-${initial.limit}`}
        mode="create"
        open={setupOpen}
        onOpenChange={setSetupOpen}
        factionOptions={factionOptions}
        value={initial}
        hasUnits={false}
        pending={draft.isPending}
        labels={{
          title: 'Draft an army',
          description: 'Choose the army to draft from your collection. You review its units before anything is saved.',
          submit: 'Draft army',
          pending: 'Drafting…',
        }}
        onSave={async (setup) => {
          await draft.mutateAsync(setup).catch(() => undefined)
          setSetupOpen(false)
        }}
      />
      <DraftReview
        draft={draft.data ?? null}
        error={draft.error}
        pending={create.pending}
        onClose={() => draft.reset()}
        onSave={(result) => create.start(result.setup, undefined, result.picks)}
      />
    </>
  )
}

function DraftReview({
  draft,
  error,
  pending,
  onClose,
  onSave,
}: {
  draft: Draft | null
  error: Error | null
  pending: boolean
  onClose: () => void
  onSave: (draft: Draft) => void
}) {
  return (
    <Dialog open={Boolean(draft || error)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Starter army</DialogTitle>
          <DialogDescription>
            Built only from models in your collection, each unit as large as your models allow. Nothing here is a model you would need to
            buy. Leaders are not attached and allies are not included; the builder checks the list once saved.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(error)}
            </p>
          ) : draft ? (
            <>
              <p className="text-sm text-dim" data-starter-summary>
                <span className="figure mr-1 text-xl text-bone">{draft.points}</span> of {draft.budget} points · {draft.picks.length}{' '}
                {draft.picks.length === 1 ? 'unit' : 'units'}
              </p>
              {!draft.owned ? (
                <p className="text-sm text-bone">Your collection has no datasheets from this army that it can field.</p>
              ) : draft.picks.length ? (
                <ul className="divide-y divide-edge border border-edge">
                  {draft.units.map((unit) => (
                    <li key={unit.key} data-starter-unit={unit.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 font-semibold text-bone uppercase">{unit.name}</span>
                      <span className="readout text-xs text-dim">
                        {unit.models} {unit.models === 1 ? 'model' : 'models'}
                      </span>
                      {unit.warlord ? <span className="text-xs text-info">Warlord</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-bone">None of your units fits this army’s points budget.</p>
              )}
              {draft.problems.length ? (
                <section aria-label="Still to resolve" className="space-y-1">
                  <h3 className="rubric text-discarded">Still to resolve in the builder</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-bone">
                    {draft.problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {draft.leftOut.length ? (
                <section aria-label="Left out" className="space-y-1">
                  <h3 className="rubric">Left out</h3>
                  <ul className="space-y-1 text-sm">
                    {draft.leftOut.map((item) => (
                      <li key={item.key} data-starter-left-out={item.name}>
                        <span className="font-semibold text-bone uppercase">{item.name}</span>{' '}
                        <span className="text-dim">— {REASONS[item.reason](item.models)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {draft?.picks.length ? (
            <Button disabled={pending} onClick={() => onSave(draft)}>
              {pending ? 'Saving…' : 'Save as roster'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
