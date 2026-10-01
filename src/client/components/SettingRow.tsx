import type { ReactNode } from 'react'

/** One bordered row on an account surface: a marked tile, a name with a line under it, and what can be done to it. */
export function SettingRow({
  icon,
  title,
  detail,
  action,
  tile = true,
}: {
  icon: ReactNode
  title: ReactNode
  detail?: ReactNode
  action?: ReactNode
  /** Off for a mark with its own shape, such as an avatar, which a square tile would box in. */
  tile?: boolean
}) {
  return (
    <div className="flex items-center gap-3 border border-edge bg-sunken p-3">
      <span className={`grid size-8 shrink-0 place-items-center ${tile ? 'bg-raised' : ''}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-bone">{title}</p>
        {detail ? <p className="text-xs text-dim">{detail}</p> : null}
      </div>
      {action}
    </div>
  )
}
