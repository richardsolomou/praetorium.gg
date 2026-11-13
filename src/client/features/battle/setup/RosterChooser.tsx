import { Link } from '@tanstack/react-router'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { pointsLabel } from '../../../../core/battle'
import { buttonClass } from '../../../components/buttonClass'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/Dialog'
import { NoFilterMatches } from '../../../components/NoFilterMatches'
import { Problem } from '../../../components/Problem'
import { SectionHeading } from '../../../components/SectionHeading'
import type { Army } from '../../../sides'
import { LentRosterList, type LentRoster } from '../../rosters/LentRosters'
import { useRosterChoiceFilter } from '../../rosters/RosterChoiceFilter'
import { RosterChoices } from '../../rosters/RosterChoices'
import type { SavedRoster } from '../../rosters/rosterLibrary'
import type { RosterProblem } from '../../rosters/RosterSummary'
import { BATTLE_SIZE_CONTROL } from './chrome'

/** The lists an army may field in a battle: your own, and those friends lent you. */
export function RosterChooser({
  open,
  onOpenChange,
  forArmy,
  rosters,
  lent,
  savedCount,
  requiredLimit,
  orSmaller,
  selectedId,
  loading,
  pending,
  onChoose,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  forArmy: Army | null
  rosters: SavedRoster[]
  /** Rosters friends have lent this player, which they may field as their own army. */
  lent: LentRoster[]
  savedCount: number
  requiredLimit: number | null
  /** Whether a list built for a smaller size fits too, as it does in a team battle. */
  orSmaller: boolean
  /** The list already fielded by this army, matched by id: two lists can share a name. */
  selectedId: string | null
  loading: boolean
  pending: boolean
  onChoose: (roster: SavedRoster, problem?: RosterProblem | null) => void
  error: string | null
}) {
  const changingSize = useRef(false)
  const filter = useRosterChoiceFilter({ rosters, lent })
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      // After the close, so the dialog's own focus return to its trigger does not take it back.
      onOpenChangeComplete={(opened) => {
        if (opened || !changingSize.current) return
        changingSize.current = false
        document.getElementById(BATTLE_SIZE_CONTROL)?.focus()
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {forArmy?.automated ? `Choose ${forArmy.playerName}’s roster` : 'Choose your roster'}
          </DialogTitle>
          <DialogDescription>
            {/* A practice opponent owns no lists, so the army it brings comes from yours. */}
            {forArmy?.automated ? 'One of your own lists, played by the side across the table. ' : ''}
            {requiredLimit === null ? 'Your rosters.' : `Rosters built for ${pointsLabel(requiredLimit)}${orSmaller ? ' or fewer' : ''}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? <Problem>{error}</Problem> : null}
          {loading ? null : filter.bar}
          {filter.failed ? (
            <Problem>Some rosters’ points and legality could not be checked, so this filter leaves them out.</Problem>
          ) : null}
          {loading || filter.pending ? (
            <div className="space-y-2" aria-label="Loading rosters">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex min-h-20 items-center gap-3 rounded-lg border border-edge bg-sunken p-3" aria-hidden>
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-5 w-28" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : !rosters.length ? (
            <>
              <SectionHeading title="Rosters" count={0} className="mb-0" />
              <div className="space-y-3 rounded-lg border border-edge bg-sunken p-4">
                <p className="text-sm text-dim">
                  {savedCount
                    ? `None of your ${savedCount} saved rosters is built for ${pointsLabel(requiredLimit!)}${orSmaller ? ' or fewer' : ''}.`
                    : 'You do not have a saved roster yet.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {savedCount > 0 && requiredLimit !== null ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        changingSize.current = true
                        onOpenChange(false)
                      }}
                    >
                      Choose a different battle size
                    </Button>
                  ) : null}
                  <Link
                    to="/rosters"
                    search={requiredLimit === null ? {} : { limit: requiredLimit }}
                    className={buttonClass({ variant: 'outline', size: 'sm' })}
                  >
                    Open your roster library
                  </Link>
                </div>
              </div>
              {lent.length && !filter.lent.length ? <NoFilterMatches>No lent rosters match these filters.</NoFilterMatches> : null}
            </>
          ) : filter.rosters.length ? (
            <>
              <SectionHeading title="Rosters" count={filter.rosters.length} className="mb-0" />
              <RosterChoices rosters={filter.rosters} sort={filter.sort} selectedId={selectedId} disabled={pending} onSelect={onChoose} />
            </>
          ) : filter.lent.length ? null : (
            <NoFilterMatches>No rosters match these filters.</NoFilterMatches>
          )}
          {filter.lent.length && !filter.pending ? (
            <>
              <SectionHeading title="Lent by friends" count={filter.lent.length} className="mb-0" />
              <LentRosterList rosters={filter.lent} selectedId={selectedId} disabled={pending} onChoose={onChoose} />
            </>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
