import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { gameReferencesQuery } from '../../queries'
import type { Side } from '../../sides'
import { tint } from '../battle/tints'
import { SidePlayers } from '../PlayerName'
import { dispositionTone } from '../rosterSetup'

/**
 * The parts every setup step is built from.
 *
 * Setup is a rail of screens the table walks through together, and it should read as
 * one screen changing rather than a pile that were each drawn separately. Each step used to
 * bring its own surface, its own way of marking a choice and its own way of saying
 * something in passing, so moving between them moved the furniture. These are that
 * vocabulary, written once.
 */

/** The surface a step's content sits on. One radius, one border, one padding. */
export function SetupPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-sm border border-edge bg-panel p-4 ${className}`}>{children}</div>
}

/** Something the step says in passing: what a rule implies, or who may do this. */
export function SetupNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`rounded-sm border border-edge bg-sunken px-3 py-2 text-xs text-dim ${className}`}>{children}</p>
}

/**
 * One side's own surface, tinted like the panel that will draw it once the battle
 * starts, so the two sides are the same two colours from the first screen to the last.
 */
export function SetupSidePanel({ side, children, className = '' }: { side: Side; children: ReactNode; className?: string }) {
  return (
    <SetupPanel className={`space-y-2 border-t-2 p-3 ${tint(side.index).edge} ${className}`}>
      {/* Pictured and named, the way every other screen introduces a side. */}
      <SidePlayers side={side} />
      {children}
    </SetupPanel>
  )
}

/**
 * How a chosen thing looks, wherever setup asks for one.
 *
 * A side, a battlefield layout and a mission pack are the same question three times,
 * and each answered it in a different colour. One ring, one tint, one weight.
 */
export const CHOSEN = 'border-parchment bg-parchment/10 ring-1 ring-parchment'
export const CHOOSABLE = 'border-edge hover:border-edge-strong'

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
  return <span className={`chip ${dispositionTone(disposition.id)} ${className}`}>{disposition.name}</span>
}

/**
 * A value the log stores, written the way the rest of the screen writes a name.
 *
 * Where a unit starts and what it may do before the battle are the same vocabulary —
 * `deep-strike`, `scouts` — read in two sections, so one of them spelling it
 * `Deep strike` and the other `Deep Strike` would be the same fact in two hands.
 */
export const formationLabel = (value: string) => {
  const words = value.replaceAll('-', ' ')
  return words.charAt(0).toLocaleUpperCase() + words.slice(1)
}
