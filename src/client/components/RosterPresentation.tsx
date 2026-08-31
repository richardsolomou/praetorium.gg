import { Link } from '@tanstack/react-router'
import type { ChangeEventHandler, ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { GAME_SIZES, type FormatRule } from '../../core/battle'
import { FactionLabel, type FactionPresentation } from './FactionMark'
import { WaiverChip } from './FormatWaivers'
import { dispositionTone } from './rosterSetup'

type PresentedFaction = FactionPresentation & {
  detachments: readonly {
    id: string
    slug: string
    dispositions: readonly { id: string; name: string }[]
  }[]
}

export type PresentedDetachment = {
  id?: string
  name: string
  points?: number | null
}

const NO_DETACHMENTS: readonly PresentedDetachment[] = []
const NO_WAIVERS: readonly FormatRule[] = []

type RosterHeaderProps = {
  name: string
  nameId?: string
  onNameChange?: ChangeEventHandler<HTMLInputElement>
  maxLength?: number
  placeholder?: string
  faction?: PresentedFaction | null
  factionLoading?: boolean
  points?: number | null
  limit?: number
  detachments?: readonly PresentedDetachment[]
  disposition?: string | null
  /** The format restrictions this list is not playing, named beside it wherever it is read. */
  waivers?: readonly FormatRule[]
  actions?: ReactNode
  children?: ReactNode
}

export function RosterHeader({
  name,
  nameId,
  onNameChange,
  maxLength,
  placeholder,
  faction,
  factionLoading = false,
  points,
  limit,
  detachments = NO_DETACHMENTS,
  disposition,
  waivers = NO_WAIVERS,
  actions,
  children,
}: RosterHeaderProps) {
  const hasPoints = points !== null && points !== undefined
  const hasSummary = hasPoints || limit !== undefined
  const shownDisposition = disposition
    ? (faction?.detachments.flatMap((entry) => entry.dispositions).find((entry) => entry.id === disposition) ?? {
        id: disposition,
        name: disposition,
      })
    : null

  return (
    <header className="border-b border-edge px-3 py-2">
      <Input
        id={nameId}
        value={name}
        onChange={onNameChange}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label="List name"
        readOnly={!onNameChange}
        className="h-8 border-0 bg-transparent px-0 text-lg font-bold tracking-[0.02em] uppercase focus-visible:ring-0"
      />

      {faction || factionLoading || limit !== undefined ? (
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-dim">
          <span className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {faction ? (
              <Link
                to="/factions/$catalogueId"
                params={{ catalogueId: faction.slug }}
                className="flex shrink-0 items-center self-stretch text-info hover:text-bone"
              >
                <FactionLabel faction={faction} />
              </Link>
            ) : factionLoading ? (
              <Skeleton className="h-5 w-28 shrink-0" aria-label="Loading faction" />
            ) : null}
            {faction && hasSummary ? <span aria-hidden>·</span> : null}
            {hasPoints ? <span className="chip text-info">{points} pts</span> : null}
            {hasPoints && limit !== undefined ? <span aria-hidden>·</span> : null}
            {limit !== undefined ? (
              <span className="shrink-0">{GAME_SIZES.find((size) => size.limit === limit)?.name ?? `${limit} points`}</span>
            ) : null}
            {detachments.map((detachment) => {
              const reference = faction?.detachments.find((candidate) => candidate.id === detachment.id)
              const label = `${detachment.name}${detachment.points === null || detachment.points === undefined ? '' : ` · ${detachment.points} DP`}`
              return (
                <span key={detachment.id ?? detachment.name} className="contents">
                  <span aria-hidden>·</span>
                  {faction && reference ? (
                    <Link
                      to="/factions/$catalogueId/detachments/$detachmentId"
                      params={{ catalogueId: faction.slug, detachmentId: reference.slug }}
                      className="shrink-0 text-info hover:text-bone"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="shrink-0">{label}</span>
                  )}
                </span>
              )
            })}
            {shownDisposition ? (
              <span className="contents">
                <span aria-hidden>·</span>
                <span className={`chip shrink-0 ${dispositionTone(shownDisposition.id)}`}>{shownDisposition.name}</span>
              </span>
            ) : null}
            <WaiverChip rules={waivers} />
          </span>
          {actions ? (
            <span className="flex shrink-0 items-center gap-1" data-print-hide>
              {actions}
            </span>
          ) : null}
        </div>
      ) : null}

      {children}
    </header>
  )
}

type RosterShellProps = {
  children: ReactNode
  saving?: boolean
  saveError?: boolean
}

export function RosterShell({ children, saving, saveError }: RosterShellProps) {
  return (
    <div
      data-roster-builder
      data-saving={saving}
      data-save-error={saveError}
      className="flex min-h-0 flex-1 flex-col border border-edge bg-sunken"
    >
      {children}
    </div>
  )
}

export function RosterBody({ children, threeColumn = false }: { children: ReactNode; threeColumn?: boolean }) {
  return (
    <div
      className={`flex min-h-0 flex-1 ${
        threeColumn ? 'min-[1300px]:grid min-[1300px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1.45fr)_minmax(0,1.45fr)]' : ''
      }`}
    >
      {children}
    </div>
  )
}

export function RosterUnits({ children }: { children: ReactNode }) {
  return (
    <div data-slot="roster-units" className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3">
      {children}
    </div>
  )
}
