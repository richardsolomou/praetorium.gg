import { WaiverChip } from '../../components/FormatWaivers'
import type { FormatRule } from '../../../core/battle'
import { type ReactNode, useEffect, useRef } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { UnavailableSelection } from '../../../core/rosterSelections'
import { requestNativeHaptic } from '../../nativeBridge'
import { advanceOnboarding } from '../onboarding/onboarding'

type Props = {
  loading: boolean
  over: boolean
  illegal: boolean
  points: number
  limit: number
  hasUnits: boolean
  editable: boolean
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
  sealedEventWarning?: ReactNode
  waivers: readonly FormatRule[]
}

export function RosterBuilderFooter({
  loading,
  over,
  illegal,
  points,
  limit,
  hasUnits,
  editable,
  onAddUnits,
  saveFailed,
  saving,
  onRetrySave,
  onSave,
  errors,
  onResetOptions,
  unhandled,
  frozen,
  sealedEventWarning,
  waivers,
}: Props) {
  // Felt as the roster crosses the limit, not on opening one already over it.
  const wasOver = useRef<boolean | null>(null)
  useEffect(() => {
    if (loading) return
    if (over && wasOver.current === false) requestNativeHaptic('warning')
    wasOver.current = over
  }, [loading, over])
  const status = over
    ? { label: 'Over the limit', tone: 'text-destructive' }
    : illegal
      ? { label: 'Not legal', tone: 'text-destructive' }
      : !hasUnits
        ? { label: '', tone: 'text-dim' }
        : points > limit
          ? { label: 'Limit off', tone: 'text-dim' }
          : { label: 'Legal', tone: 'text-achieved' }
  return (
    <footer className="sticky bottom-0 z-20 border-t border-edge bg-void px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <span data-onboarding="roster-points" className="block min-w-0 max-w-sm flex-1">
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
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span data-stat="points" className={`figure text-[2.125rem] leading-none ${over ? 'text-destructive' : 'text-bone'}`}>
              {loading ? (
                <span aria-label="Loading roster points">…</span>
              ) : (
                // Keyed on the value, so each unit added or removed answers with the total rising into place.
                <span key={points} className="inline-block animate-figure">
                  {points}
                </span>
              )}
              <span className="text-xl text-faint">/{limit}</span>
            </span>
            <WaiverChip rules={waivers} />
            {sealedEventWarning}
          </span>
          {loading ? (
            <Skeleton className="mt-1 h-4 w-32" aria-hidden />
          ) : (
            <span className={`mt-0.5 flex items-center gap-1 text-2xs ${status.tone}`}>
              {over || illegal ? <TriangleAlert className="size-3.5" aria-hidden /> : null}
              {status.label ? <span aria-hidden>{status.label} · </span> : null}
              <span data-stat="points-left">{points > limit ? `${points - limit} over` : `${limit - points} left`}</span>
            </span>
          )}
          <span className="mt-1 block h-1.5 bg-edge" aria-hidden>
            <span
              className={`block h-full transition-[width] ${over ? 'bg-destructive' : 'bg-parchment'}`}
              style={{ width: `${limit > 0 ? Math.min(points / limit, 1) * 100 : 0}%` }}
            />
          </span>
        </span>

        <span className="flex items-center gap-2">
          {editable ? (
            <Button
              data-onboarding="roster-picker"
              variant={onSave ? 'outline' : 'default'}
              className="h-11 px-4.5 text-base roster-wide:hidden"
              onClick={() => {
                advanceOnboarding('roster', 'roster-picker', 'roster-search')
                onAddUnits()
              }}
            >
              Add units
            </Button>
          ) : null}
          {onSave ? (
            <Button className="h-11 px-4.5 text-base" onClick={onSave} disabled={!hasUnits} aria-label="Save roster">
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
          className="mt-2 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">Your latest changes have not been saved.</span>
          <Button variant="outline" size="xs" onClick={onRetrySave} disabled={saving}>
            Try again
          </Button>
        </div>
      ) : null}
      {!frozen && errors.length ? (
        <ul className="mt-2 space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
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
        <div className="mt-2 rounded-lg border border-discarded/40 bg-discarded/5 p-2.5 text-xs text-discarded">
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
    </footer>
  )
}
