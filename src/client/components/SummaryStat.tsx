import type { LucideIcon } from 'lucide-react'

export function SummaryStat({
  icon: Icon,
  label,
  value,
  tone = 'text-parchment',
}: {
  icon: LucideIcon
  label: string
  value: number
  tone?: string
}) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-2 bg-panel px-2 py-3 text-center sm:justify-start sm:gap-3 sm:p-4 sm:text-left">
      <Icon className={`hidden size-5 shrink-0 sm:block ${tone}`} aria-hidden />
      <span className="min-w-0">
        <span className="readout block text-xl sm:text-2xl">{value}</span>
        <span className="eyebrow block truncate text-faint">{label}</span>
      </span>
    </div>
  )
}
