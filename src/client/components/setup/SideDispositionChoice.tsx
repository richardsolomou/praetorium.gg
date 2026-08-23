import { Button } from '@/components/ui/button'
import type { Command } from '../../../core/battle'
import { type Side, sideName } from '../../sides'
import { SidePlayers } from '../PlayerName'
import { CHOOSABLE, CHOSEN, SetupNote, SetupPanel } from './chrome'

/**
 * Which Force Disposition an allied side plays, where its two armies brought different ones.
 *
 * A side fields one army between them and plays one card, so a pair that wrote down
 * different cards has to say which of the two the side is playing — it sets the
 * primary mission the side is given and the battlefields the matchup offers. Nothing
 * is chosen for them: taking the first seat's card would play one ally's answer for
 * both without ever asking.
 *
 * Drawn only when there is something to settle. A duel, and a pair who brought the
 * same card, are never shown a question with one answer.
 */
export function SideDispositionChoice({
  sides,
  nameDisposition,
  send,
}: {
  sides: Side[]
  nameDisposition: (id: string | null | undefined) => { id: string; name: string } | null
  send: (command: Command) => void
}) {
  const asked = sides.filter((side) => side.dispositionChoices.length > 1)
  if (!asked.length) return null

  return (
    <SetupPanel className="space-y-2">
      <p className="eyebrow">Force Disposition</p>
      <SetupNote>
        An allied side fields one army between them and plays one Force Disposition, chosen from those either ally brought. It is what the
        primary mission facing them is read from.
      </SetupNote>
      {asked.map((side) => (
        <fieldset key={side.index} className="flex flex-wrap items-center justify-between gap-2">
          <legend className="sr-only">Force Disposition for {sideName(side)}</legend>
          <SidePlayers side={side} linked={false} />
          <span className="flex flex-wrap gap-1">
            {side.dispositionChoices.map((id) => {
              const chosen = side.disposition === id
              const named = nameDisposition(id)?.name ?? id
              return (
                <Button
                  key={id}
                  variant="outline"
                  size="xs"
                  aria-pressed={chosen}
                  aria-label={`Play ${named} for ${sideName(side)}`}
                  className={chosen ? CHOSEN : CHOOSABLE}
                  onClick={() => send({ kind: 'set-side-disposition', side: side.index, disposition: id })}
                >
                  {named}
                </Button>
              )
            })}
          </span>
        </fieldset>
      ))}
    </SetupPanel>
  )
}
