import { cn } from '@/lib/utils'
import type { MissionAction } from '../../server/missionActions'
import { RuleText } from './RuleText'

/**
 * The actions a mission card names, which is how most of what it pays is earned.
 *
 * Written out the way a stratagem is, in the pack's own words and in the order it
 * prints them. A line the pack does not state is left out rather than shown empty,
 * so an action with no restriction states none.
 */
export function MissionActions({ actions, className }: { actions: MissionAction[]; className?: string }) {
  if (!actions.length) return null
  return (
    <div className={cn('space-y-3', className)}>
      {actions.map((action) => (
        <ActionBlock key={action.name} action={action} />
      ))}
    </div>
  )
}

function ActionBlock({ action }: { action: MissionAction }) {
  const lines: [string, string | null][] = [
    ['Starts', action.starts],
    ['Completes', action.completes],
    ['Effect', action.effect],
    ['Units', action.units],
    ['Use limit', action.useLimit],
    ['Restriction', action.restriction],
  ]
  const text = lines.flatMap(([label, line]) => (line ? [`**${label}:** ${line}`] : [])).join('\n\n')
  return (
    <div className="border border-edge bg-sunken p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="chip">Action</span>
        <span className="text-base font-bold text-bone uppercase">{action.name}</span>
      </div>
      {text ? <RuleText text={text} className="mt-3 text-base text-bone" /> : null}
    </div>
  )
}
