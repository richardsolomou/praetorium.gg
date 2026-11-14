import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/** What a roster shows in place of its units when its army book was replaced or its army data could not be read. */
export function ArmyUnavailable({
  retired,
  editable,
  onChooseFaction,
  onRetry,
  children,
}: {
  /** The army book was replaced, so the roster has to be rebuilt from a current faction. */
  retired: boolean
  editable: boolean
  onChooseFaction: () => void
  onRetry: () => void
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-edge bg-sunken p-8 text-center">
      <div>
        <p className="eyebrow">{retired ? 'Army book replaced' : 'Army data unavailable'}</p>
        <p className="mt-2 text-sm text-dim">
          {retired
            ? 'Choose a current faction and detachment to rebuild this roster.'
            : 'Army data could not be loaded. Your roster is unchanged.'}
        </p>
        {retired && editable ? <Button onClick={onChooseFaction}>Choose current faction</Button> : null}
        {retired ? null : (
          <Button className="mt-4" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
      {children}
    </div>
  )
}
