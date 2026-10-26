import { FactionReferenceLink } from '../../components/FactionReferenceLink'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEventHandler, CSSProperties, ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { battleSizeLabel, type FormatRule } from '../../../core/battle'
import type { OnboardingTarget } from '../onboarding/onboarding'
import { FactionLabel, type FactionPresentation } from '../../components/FactionMark'
import { WaiverChip } from '../../components/FormatWaivers'
import { dispositionTone, factionDisposition } from '../../components/rosterSetup'
import type { CatalogueEdition } from '../../../core/catalogueEdition'
import { countLabel } from '../../text'

type PresentedFaction = FactionPresentation & {
  edition?: Pick<CatalogueEdition, 'id' | 'name' | 'status'> | null
  detachments: readonly {
    id: string
    slug: string
    referenceRoute?: { catalogueId: string; slug: string } | null
    dispositions: readonly { id: string; name: string }[]
  }[]
}

type PresentedDetachment = {
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
  /** What an unnamed list is called. Shown as the title itself where nobody can type. */
  placeholder?: string
  faction?: PresentedFaction | null
  edition?: Pick<CatalogueEdition, 'id' | 'name' | 'status'> | null
  factionLoading?: boolean
  points?: number | null
  limit?: number
  pointsBudget?: number | null
  unitCount?: number
  modelCount?: number
  detachments?: readonly PresentedDetachment[]
  disposition?: string | null
  /** The format restrictions this list is not playing, named beside it wherever it is read. */
  waivers?: readonly FormatRule[]
  actions?: ReactNode
  children?: ReactNode
}

const FADE = '1.25rem'

function edgeMask(start: boolean, end: boolean) {
  if (!start && !end) return undefined
  const opening = start ? `transparent 0, black ${FADE}` : 'black 0'
  const closing = end ? `black calc(100% - ${FADE}), transparent 100%` : 'black 100%'
  return `linear-gradient(to right, ${opening}, ${closing})`
}

function scrollEdges(node: HTMLElement, current: { start: boolean; end: boolean }) {
  const start = node.scrollLeft > 1
  const end = Math.ceil(node.scrollLeft + node.clientWidth) < node.scrollWidth
  return current.start === start && current.end === end ? current : { start, end }
}

/**
 * Fades whichever end of a horizontal scroller still holds content, so a row that
 * has more to say says so rather than ending in a hard clip mid-word.
 */
function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [edges, setEdges] = useState({ start: false, end: false })
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const remeasure = () => setEdges((current) => scrollEdges(node, current))
    node.addEventListener('scroll', remeasure, { passive: true })
    // Content decides the overflow as much as the viewport does, and a detachment can change under a row that never
    // resized. Observing the items reads layout once it has settled; measuring after every render forced a layout of
    // the whole roster on each of the editor's several renders per keystroke.
    const observer = new ResizeObserver(remeasure)
    const observeItems = () => {
      observer.disconnect()
      observer.observe(node)
      for (const item of node.children) observer.observe(item)
    }
    observeItems()
    const items = new MutationObserver(observeItems)
    items.observe(node, { childList: true })
    return () => {
      node.removeEventListener('scroll', remeasure)
      observer.disconnect()
      items.disconnect()
    }
  }, [])
  const mask = edgeMask(edges.start, edges.end)
  return { ref, style: mask ? ({ maskImage: mask, WebkitMaskImage: mask } satisfies CSSProperties) : undefined }
}

export function RosterHeader({
  name,
  nameId,
  onNameChange,
  maxLength,
  placeholder,
  faction,
  edition = faction?.edition,
  factionLoading = false,
  points,
  limit,
  pointsBudget,
  unitCount,
  modelCount,
  detachments = NO_DETACHMENTS,
  disposition,
  waivers = NO_WAIVERS,
  actions,
  children,
}: RosterHeaderProps) {
  const { ref: metaRef, style: metaStyle } = useScrollEdges<HTMLSpanElement>()
  const hasPoints = points !== null && points !== undefined
  const hasSummary = hasPoints || limit !== undefined
  const knownDisposition = disposition ? factionDisposition(faction, disposition) : undefined

  return (
    <header className="border-b border-edge px-3 py-2">
      {/*
       * A placeholder is not a value: it neither prints nor reads as a title. So the
       * field only holds one where somebody can replace it, and every other reading
       * of this list — a shared roster, a printed sheet — is given the words.
       */}
      <Input
        id={nameId}
        value={onNameChange ? name : name || placeholder || ''}
        onChange={onNameChange}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label="List name"
        readOnly={!onNameChange}
        data-print-hide={onNameChange && !name ? '' : undefined}
        className="h-8 border-0 bg-transparent px-0 text-lg font-bold tracking-wide uppercase focus-visible:border-b focus-visible:border-info focus-visible:ring-0 md:text-lg dark:bg-transparent"
      />
      {onNameChange && !name && placeholder ? (
        <p className="hidden h-8 items-center text-lg font-bold tracking-wide uppercase print:flex">{placeholder}</p>
      ) : null}

      {faction || factionLoading || limit !== undefined ? (
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-dim">
          <span
            ref={metaRef}
            style={metaStyle}
            data-slot="roster-meta"
            className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {faction ? (
              <FactionReferenceLink
                to="/factions/$catalogueId"
                params={{ catalogueId: faction.slug }}
                className="flex shrink-0 items-center self-stretch text-info hover:text-bone"
              >
                <FactionLabel faction={faction} edition={edition} />
              </FactionReferenceLink>
            ) : factionLoading ? (
              <Skeleton className="h-5 w-28 shrink-0" aria-label="Loading faction" />
            ) : null}
            {faction && hasSummary ? <span aria-hidden>·</span> : null}
            {hasPoints ? <span className="chip text-info">{points} pts</span> : null}
            {hasPoints && limit !== undefined ? <span aria-hidden>·</span> : null}
            {limit !== undefined ? <span className="shrink-0">{battleSizeLabel(limit, pointsBudget)}</span> : null}
            {unitCount === undefined ? null : (
              <span className="contents">
                <span aria-hidden>·</span>
                <span className="shrink-0">{countLabel(unitCount, 'unit')}</span>
              </span>
            )}
            {modelCount === undefined ? null : (
              <span className="contents">
                <span aria-hidden>·</span>
                <span className="shrink-0">{countLabel(modelCount, 'model')}</span>
              </span>
            )}
            {detachments.map((detachment) => {
              const reference = faction?.detachments.find((candidate) => candidate.id === detachment.id)
              const label = `${detachment.name}${detachment.points === null || detachment.points === undefined ? '' : ` · ${detachment.points} DP`}`
              return (
                <span key={detachment.id ?? detachment.name} className="contents">
                  <span aria-hidden>·</span>
                  {faction && reference && reference.referenceRoute !== null ? (
                    <FactionReferenceLink
                      to="/factions/$catalogueId/detachments/$detachmentId"
                      params={{
                        catalogueId: reference.referenceRoute?.catalogueId ?? faction.slug,
                        detachmentId: reference.referenceRoute?.slug ?? reference.slug,
                      }}
                      className="shrink-0 text-info hover:text-bone"
                    >
                      {label}
                    </FactionReferenceLink>
                  ) : (
                    <span className="shrink-0">{label}</span>
                  )}
                </span>
              )
            })}
            {disposition ? (
              <span className="contents">
                <span aria-hidden>·</span>
                {knownDisposition ? (
                  <Link
                    to="/force-dispositions/$dispositionId"
                    params={{ dispositionId: knownDisposition.id }}
                    className={`chip shrink-0 hover:text-bone ${dispositionTone(knownDisposition.id)}`}
                  >
                    {knownDisposition.name}
                  </Link>
                ) : (
                  <span className={`chip shrink-0 ${dispositionTone(disposition)}`}>{disposition}</span>
                )}
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
  busy?: boolean
}

export function RosterShell({ children, saving, saveError, busy }: RosterShellProps) {
  return (
    <div
      aria-busy={busy}
      data-roster-builder
      data-saving={saving}
      data-save-error={saveError}
      className="flex w-full min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden border border-edge bg-sunken"
    >
      {children}
    </div>
  )
}

/** The builder's outline, for the frames before its army data has loaded. */
export function RosterOutline() {
  return (
    <RosterShell busy>
      <div className="h-24 border-b border-edge bg-panel" />
      <RosterBody threeColumn>
        <div className="hidden border-r border-edge min-[1300px]:block" />
        <div className="flex-1" />
        <div className="hidden border-l border-edge min-[1300px]:block" />
      </RosterBody>
      <div className="h-14 border-t border-edge bg-panel" />
    </RosterShell>
  )
}

export function RosterBody({ children, threeColumn = false }: { children: ReactNode; threeColumn?: boolean }) {
  return (
    <div
      className={`flex min-h-0 min-w-0 max-w-full flex-1 overflow-hidden ${
        threeColumn ? 'min-[1300px]:grid min-[1300px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1.45fr)_minmax(0,1.45fr)]' : ''
      }`}
    >
      {children}
    </div>
  )
}

export function RosterUnits({ children, onboarding }: { children: ReactNode; onboarding?: OnboardingTarget }) {
  return (
    <div
      data-slot="roster-units"
      data-onboarding={onboarding}
      className="min-h-0 w-full min-w-0 max-w-full flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none px-3"
    >
      {children}
    </div>
  )
}
