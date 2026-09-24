/**
 * What a link preview image shows, already worded for a reader with no account.
 *
 * Built by the same functions that write the page's own metadata, so the picture a
 * chat unfurls and the title beneath it cannot describe two different things.
 */
export type PreviewCard =
  | { kind: 'site'; title: string; description: string }
  | {
      kind: 'battle'
      /** Setting up, Live or Finished, in the words every battle list uses. */
      stage: string
      /** The round and phase, or how the battle ended. */
      status: string | null
      /** In side order; a score is absent while the table is still being set. */
      sides: { score: number | null; armies: { player: string; faction: string | null }[] }[]
      footer: string | null
    }
  | { kind: 'roster'; name: string; faction: string | null; detachments: string | null; points: string | null }
  | { kind: 'player'; name: string; record: string | null; rank: string | null }

/** The size every unfurling client expects of a large card. */
export const PREVIEW_SIZE = { width: 1200, height: 630 } as const

/** How the instance introduces itself wherever a page has nothing more particular to say. */
export const SITE = {
  name: 'Praetorium',
  title: 'Warhammer 40,000 army builder and battle tracker',
  description: 'Build Warhammer 40,000 armies and track your games from setup to final score.',
} as const
