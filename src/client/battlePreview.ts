import { battleSizeText } from '../core/battle'
import type { BattleView } from '../core/battleView'
import { capitalised } from '../core/text'
import { battleOutcome } from './battleOutcome'
import { battleStage } from './battleStage'
import { clip, type LinkPreview } from './linkPreview'
import { sides } from './sides'

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
  const size = battleSizeText(view)
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
