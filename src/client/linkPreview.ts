import { PREVIEW_SIZE, type PreviewCard, SITE } from '../contracts/linkPreview'
import type { BattleView } from '../core/battleView'
import type { RosterVisibility } from '../core/savedRoster'
import type { ServiceRecord } from '../core/serviceRecord'
import { battleOutcome } from './battleOutcome'
import { battleStage } from './battleStage'
import { recordSummary } from './features/profile/recordSummary'
import type { Rankings } from './features/profile/PlayerRankings'
import { sides } from './sides'

/**
 * What a page says about itself to something unfurling its link.
 *
 * A crawler carries no session, so the loader it triggers reads what a signed-out
 * reader may see and these are built from that. The same builders feed the preview
 * images, which read with no session at all, so a picture and its caption agree.
 */
export type LinkPreview = { title: string; description: string; card: PreviewCard }

type Page = {
  title: string
  description: string
  /** The page's own address, for `og:url`. */
  path?: string
  /** Its preview image; absent pages keep the instance's own card. */
  image?: { path: string; alt: string }
  /** For a page anyone holding the link may read but nobody should find by searching. */
  noindex?: boolean
}

/** Long enough for any real name, short enough that whatever was typed, a preview stays bounded. */
const TEXT_LIMIT = 80

const clip = (text: string) => (text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT - 1)}…` : text)

const capitalised = (word: string) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`

export const sitePreviewPath = '/api/previews/site'

/** The tags every page shares, which a page's own tags replace one by one. */
export function siteMeta(origin: string) {
  return [
    { title: `${SITE.name} — ${SITE.title}` },
    { name: 'description', content: SITE.description },
    { property: 'og:title', content: SITE.name },
    { property: 'og:description', content: SITE.description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SITE.name },
    ...imageMeta(origin, { path: sitePreviewPath, alt: SITE.title }),
    { name: 'twitter:card', content: 'summary_large_image' },
  ]
}

export function pageMeta(origin: string, page: Page) {
  return [
    { title: `${page.title} — ${SITE.name}` },
    { name: 'description', content: page.description },
    { property: 'og:title', content: page.title },
    { property: 'og:description', content: page.description },
    ...(page.path ? [{ property: 'og:url', content: `${origin}${page.path}` }] : []),
    ...(page.image ? imageMeta(origin, page.image) : []),
    ...(page.noindex ? [{ name: 'robots', content: 'noindex' }] : []),
  ]
}

function imageMeta(origin: string, image: { path: string; alt: string }) {
  return [
    { property: 'og:image', content: `${origin}${image.path}` },
    { property: 'og:image:type', content: 'image/png' },
    { property: 'og:image:width', content: String(PREVIEW_SIZE.width) },
    { property: 'og:image:height', content: String(PREVIEW_SIZE.height) },
    { property: 'og:image:alt', content: image.alt },
  ]
}

export const siteCard: PreviewCard = { kind: 'site', title: SITE.title, description: SITE.description }

/** What a battle link says when its reader may not watch it: that it is a battle, and nothing about whose. */
export const hiddenBattle = { title: 'Battle', description: 'A Warhammer 40,000 battle on Praetorium.' }

/**
 * A battle as its players, armies, stage and score.
 *
 * Read from the view the reader was given, so nothing `battleView` withholds from a
 * spectator can reach it, and only through the fields a spectator is shown: the
 * names, the score and where the battle has got to. `factionName` resolves a
 * catalogue army; a pasted list has none.
 */
export function battlePreview(view: BattleView, factionName: (catalogueId: string) => string | null): LinkPreview {
  const table = sides(view)
  const stage = battleStage(view.status).name
  const status =
    view.status === 'playing'
      ? `Round ${view.round} · ${capitalised(view.phase)} phase`
      : view.status === 'finished'
        ? battleOutcome(table, view)
        : null
  const size = view.settings.limit ? `${view.settings.limit} points` : null
  const cardSides = table.map((side) => ({
    score: view.status === 'setup' ? null : side.total,
    armies: side.armies.map((army) => ({
      player: clip(army.playerName),
      faction: army.roster?.built ? factionName(army.roster.built.catalogueId) : null,
    })),
  }))
  const score = view.status === 'playing' ? cardSides.map((side) => side.score).join('–') : null
  return {
    title: cardSides
      .map((side) => side.armies.map((army) => (army.faction ? `${army.player} (${army.faction})` : army.player)).join(' & '))
      .join(' vs '),
    description: [stage, status, score, size].filter(Boolean).join(' · '),
    card: { kind: 'battle', stage, status, sides: cardSides, footer: size },
  }
}

/**
 * A saved list as its name, army and points, from the same price its page draws.
 *
 * A list its owner never named reads the label `rosterLabel` folds for it. A price is
 * absent on an instance with no army data, and the list is then only its name and size.
 */
export function rosterPreview(
  roster: { name: string; limit: number },
  faction: { displayName: string } | null,
  price: { label: string; points: number; detachments: readonly { name: string }[] } | null,
): LinkPreview {
  const name = clip(roster.name.trim() || price?.label || 'Army list')
  const points = price ? `${price.points} / ${roster.limit} points` : `${roster.limit} points`
  const detachments = price?.detachments.map((detachment) => clip(detachment.name)).join(' & ') || null
  const factionName = faction?.displayName ?? null
  return {
    title: name,
    description: [factionName, detachments, points].filter(Boolean).join(' · '),
    card: { kind: 'roster', name, faction: factionName, detachments, points },
  }
}

/** Whether a list's own link previews it, and whether it may be indexed. A private list's link answers nobody else. */
export const rosterExposure = (visibility: RosterVisibility) => ({ image: visibility !== 'private', noindex: visibility !== 'public' })

/**
 * A player as their name, and their record and rank where this reader may see them.
 *
 * `record` arrives narrowed to the battles the reader may watch and `rankings` from
 * the leaderboard's own fold, the two things the profile page itself shows, so a
 * player who keeps their battles to themselves previews as a name alone.
 */
export function playerPreview(name: string, record: ServiceRecord | null | undefined, rankings: Rankings | null | undefined): LinkPreview {
  const title = clip(name)
  const summary = record?.battles ? recordSummary(record) : null
  const rank = rankings?.overall ? `Place ${rankings.overall.place} of ${rankings.overall.of} on the leaderboard` : null
  return {
    title,
    description: [summary, rank ? `${rank}.` : null].filter(Boolean).join(' ') || 'A Warhammer 40,000 player on Praetorium.',
    card: { kind: 'player', name: title, record: summary, rank },
  }
}
