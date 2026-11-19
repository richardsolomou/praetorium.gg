import type { FacetAddress, PeriodFilter } from '../../../core/listFilter'
import type { RosterSort } from '../../../core/rosterSort'
import type { MissionReference } from './rosterStart'

// Route search validation runs in the app's entry bundle, so these stay apart from the pages that render them.

export const ROSTER_VIEWS = ['friends', 'public', 'played', 'tournament-lists'] as const
type RosterView = (typeof ROSTER_VIEWS)[number]

export const LIBRARY_FACETS = [
  'limit',
  'faction',
  'detachment',
  'visibility',
  'disposition',
  'legality',
  'points',
  'updates',
  'state',
  'played',
] as const
/** `folder` is the folder being browsed; without it the library shows its folders and the lists in none. */
export type RosterLibrarySearch = PeriodFilter & { q?: string; folder?: string } & Partial<
    Record<(typeof LIBRARY_FACETS)[number], FacetAddress>
  >

export const DISCOVERY_FACETS = [
  'faction',
  'detachment',
  'rules',
  'size',
  'disposition',
  'legality',
  'points',
  'owner',
  'result',
  'against',
] as const
export type RosterDiscoverySearch = PeriodFilter & { q?: string; sort?: RosterSort } & Partial<
    Record<(typeof DISCOVERY_FACETS)[number], FacetAddress>
  >

/** The Tournament lists tab's filters: detachments by slug, so one shared by several chapters is one choice; units by datasheet id. */
export const WINNING_FACETS = ['faction', 'detachment', 'unit', 'disposition', 'placing', 'players', 'legality'] as const
export type WinningSearch = PeriodFilter & { q?: string } & Partial<Record<(typeof WINNING_FACETS)[number], FacetAddress>>

export type RostersSearch = RosterLibrarySearch &
  RosterDiscoverySearch &
  WinningSearch & { view?: RosterView; new?: true; reference?: MissionReference; import?: true }
