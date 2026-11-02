import type { ReactNode } from 'react'

/**
 * How far a long task has got, a solid line drawn along the runner toward `max`; without one it only shows the task is under way.
 * A `status` is announced above the bar as it changes.
 */
export function ProgressBar({ label, value, max, status }: { label: string; value?: number; max?: number; status?: ReactNode }) {
  const bar = (
    <progress
      aria-label={label}
      max={max || undefined}
      value={max ? (value ?? 0) : undefined}
      className="block h-1.5 w-full appearance-none border-0 [background:linear-gradient(var(--color-runner),var(--color-runner))_center/100%_2px_no-repeat] [&::-moz-progress-bar]:rounded-[2px] [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:rounded-[2px] [&::-webkit-progress-value]:bg-primary [&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-300 motion-reduce:[&::-webkit-progress-value]:transition-none"
    />
  )
  if (status === undefined) return bar
  return (
    <div className="space-y-1.5">
      <output aria-live="polite" className="block text-sm text-dim">
        {status}
      </output>
      {bar}
    </div>
  )
}
