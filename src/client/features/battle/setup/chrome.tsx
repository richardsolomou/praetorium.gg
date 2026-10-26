import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { gameReferencesQuery } from '../../../queries'
import { sideName, type Side } from '../../../sides'
import { tint } from '../battleTints'
import { SidePlayers } from '../PlayerName'
import { dispositionTone } from '../../../components/rosterSetup'
import { capitalised } from '../../../../core/text'

/**
 * The parts every setup step is built from.
 *
 * Setup is a rail of screens the table walks through together, and it should read as
 * one screen changing rather than a pile that were each drawn separately, so every step
 * shares one surface, one way of marking a choice and one way of saying something in passing.
 */

/** The surface a step's content sits on. One radius, one border, one padding. */
export function SetupPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-sm border border-edge bg-panel p-4', className)}>{children}</div>
}

/** Something the step says in passing: what a rule implies, or who may do this. */
export function SetupNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={cn('rounded-sm border border-edge bg-sunken px-3 py-2 text-xs text-dim', className)}>{children}</p>
}

/**
 * One side's column: the side's colour as a rule across the top and its content
 * directly under it, so the two sides are the same two colours from the first
 * screen to the last without a panel around each.
 */
export function SetupSidePanel({
  side,
  named = false,
  children,
  className = '',
}: {
  side: Side
  /** Pictured and named where the side is introduced; later columns keep the name for screen readers only. */
  named?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0 space-y-2 border-t-[3px] pt-3', tint(side.index).edge, className)}>
      {named ? <SidePlayers side={side} /> : <h3 className="sr-only">{sideName(side)}</h3>}
      {children}
    </div>
  )
}

/**
 * How a chosen thing looks, wherever setup asks for one.
 *
 * A side, a battlefield layout and a mission pack are the same question three times,
 * so they share one ring, one tint and one weight.
 */
export const CHOSEN = 'border-parchment bg-parchment/10 ring-1 ring-parchment'
export const CHOOSABLE = 'border-edge hover:border-edge-strong'

/** The battle size control, which the roster chooser hands focus to when no list fits the size. */
export const BATTLE_SIZE_CONTROL = 'battle-size'

/**
 * Names a force disposition the way the pack does.
 *
 * A list stores the slug it was built with; only the synced pack knows what to call
 * it. One whose name this instance cannot resolve is left unnamed rather than shown
 * a slug dressed up as a title.
 */
export function useDispositionNames() {
  const { data: references } = useQuery(gameReferencesQuery())
  return (id: string | null | undefined) => (id ? (references?.dispositions.find((entry) => entry.id === id) ?? null) : null)
}

/** A disposition in the colour the roster builder gave it, or nothing at all. */
export function DispositionChip({ disposition, className = '' }: { disposition: { id: string; name: string } | null; className?: string }) {
  if (!disposition) return null
  return (
    <span data-disposition={disposition.id} className={cn('chip', dispositionTone(disposition.id), className)}>
      {disposition.name}
    </span>
  )
}

/**
 * A value the log stores, written the way the rest of the screen writes a name.
 *
 * Where a unit starts and what it may do before the battle are the same vocabulary —
 * `deep-strike`, `scouts` — read in two sections, so one of them spelling it
 * `Deep strike` and the other `Deep Strike` would be the same fact in two hands.
 */
export const formationLabel = (value: string) => capitalised(value.replaceAll('-', ' '))
