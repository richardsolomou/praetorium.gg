import type { ComponentProps, ReactNode } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { WaiverWarning } from '../../components/FormatWaivers'
import type { UnavailableSelection } from '../../../core/rosterSelections'
import { advanceOnboarding } from '../onboarding/onboarding'

type Props = {
  loading: boolean
  over: boolean
  illegal: boolean
  points: number
  limit: number
  hasUnits: boolean
  editable: boolean
  canAddUnits: boolean
  onAddUnits: () => void
  saveFailed: boolean
  saving: boolean
  onRetrySave: () => void
  /** A visitor's way to keep the list, which takes them through signing up. */
  onSave?: () => void
  errors: readonly { entryId: string; entryName: string; message: string; unavailable?: readonly UnavailableSelection[] }[]
  /** Drops saved selections the editor cannot show, so they cannot be cleared there. */
  onResetOptions?: (unavailable: readonly UnavailableSelection[]) => void
  unhandled: readonly string[]
  frozen: boolean
  waivers: ComponentProps<typeof WaiverWarning>['rules']
  waiversDismissed: boolean
  onDismissWaivers: () => void
  sealedEventWarning?: ReactNode
}

export function RosterBuilderFooter({
  loading,
  over,
  illegal,
  points,
  limit,
  hasUnits,
  editable,
  canAddUnits,
  onAddUnits,
  saveFailed,
  saving,
  onRetrySave,
  onSave,
  errors,
  onResetOptions,
  unhandled,
  frozen,
  waivers,
  waiversDismissed,
  onDismissWaivers,
  sealedEventWarning,
}: Props) {
  return (
    <footer className="sticky bottom-0 z-20 border-t border-edge bg-panel px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span data-onboarding="roster-points" className="flex items-center gap-1.5 sm:gap-2">
          {loading ? (
            <Skeleton className="size-5" aria-hidden />
          ) : over || illegal ? (
            <TriangleAlert className="size-5 text-destructive" aria-hidden />
          ) : (
            <Check className={`size-5 ${hasUnits ? 'text-achieved' : 'text-faint'}`} aria-hidden />
          )}
          {loading ? null : (
            <span className="sr-only">
              {over
                ? 'Over the points limit'
                : illegal
                  ? 'Roster is not legal'
                  : points > limit
                    ? 'Points limit switched off'
                    : 'Within the points limit'}
            </span>
          )}
          <span data-stat="points" className={`figure text-lg font-bold sm:text-xl ${over ? 'text-destructive' : 'text-info'}`}>
            {loading ? <span aria-label="Loading roster points">…</span> : points}/{limit}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="eyebrow">points</span>
            {loading ? null : (
              <span data-stat="points-left" className={`text-xs ${over ? 'text-destructive' : 'text-dim'}`}>
                {points > limit ? `${points - limit} over` : `${limit - points} left`}
              </span>
            )}
          </span>
        </span>

        {sealedEventWarning}

        <span className="ml-auto flex items-center gap-2">
          {editable ? (
            <Button
              data-onboarding="roster-picker"
              variant="outline"
              size="sm"
              className="max-sm:min-h-11 min-[1300px]:hidden"
              onClick={() => {
                advanceOnboarding('roster', 'roster-picker', 'roster-search')
                onAddUnits()
              }}
              disabled={!canAddUnits}
            >
              Add units
            </Button>
          ) : null}
          {onSave ? (
            <Button size="sm" className="max-sm:min-h-11" onClick={onSave} disabled={!hasUnits} aria-label="Save roster">
              Save<span className="max-sm:hidden"> roster</span>
            </Button>
          ) : null}
        </span>
      </div>
      {onSave && hasUnits ? (
        <p className="mt-1 text-right text-2xs text-dim">
          Kept on this device. Choose Save roster, create an account or sign in, then return to your saved army.
        </p>
      ) : null}
      {editable && saveFailed ? (
        <div
          role="alert"
          className="mt-2 flex items-center gap-2 border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">Your latest changes have not been saved.</span>
          <Button variant="outline" size="xs" onClick={onRetrySave} disabled={saving}>
            Try again
          </Button>
        </div>
      ) : null}
      {!frozen && errors.length ? (
        <ul className="mt-2 space-y-1 border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
          {errors.slice(0, 8).map((error) => (
            <li key={`${error.entryId}-${error.message}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                {error.entryName}: {error.message}
              </span>
              {editable && onResetOptions && error.unavailable?.length ? (
                <Button variant="outline" size="xs" onClick={() => onResetOptions(error.unavailable ?? [])}>
                  Reset options
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!frozen && unhandled.length ? (
        <div className="mt-2 border border-discarded/40 bg-discarded/5 p-2.5 text-xs text-discarded">
          <p className="font-semibold uppercase">Could not check every rule</p>
          <p className="mt-1">
            Check these restrictions in the source rules before playing. A points total does not confirm every choice is legal.
          </p>
          <ul className="mt-1 list-inside list-disc">
            {unhandled.slice(0, 8).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {waiversDismissed ? null : <WaiverWarning rules={waivers} onDismiss={onDismissWaivers} editable={editable} />}
    </footer>
  )
}
