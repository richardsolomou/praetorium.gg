import type { ReactNode } from 'react'

/** One hairline row on an account surface: a marked tile, a name with a line under it, and what can be done to it, which wraps below when the name needs the room. */
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
    <div className="flex flex-wrap items-center gap-3 border-b border-edge px-1 py-3">
      <div className="flex min-w-[min(100%,10rem)] flex-1 items-center gap-3">
        <span className={`grid size-9 shrink-0 place-items-center ${tile ? 'rounded-md bg-raised' : ''}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-bone">{title}</p>
          {detail ? <p className="text-xs text-dim">{detail}</p> : null}
        </div>
      </div>
      {action}
    </div>
  )
}
