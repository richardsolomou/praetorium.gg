import { Button } from '@/components/ui/button'
import { changesPrimary, type Twist, TwistInfo } from '../MissionTwist'
import { CHOOSABLE, CHOSEN, SetupNote, SetupPanel } from './chrome'

/**
 * The optional twist a pack offers, chosen once the matchup is known.
 *
 * It changes one rule for the whole battle, so it is settled with the missions it
 * bends rather than buried in the format — its own panel under them, now that reading
 * the mission is a section of its own with room for both. "No twist" is a choice on
 * the same row as the rest, because most games are played without one.
 *
 * What each one says opens in a dialog from the mark beside it — every one of them,
 * not only the one already taken, because what they say is how the choice is made.
 *
 * A pack that prints none offers none, and nothing is invented to fill the gap.
 */
export function TwistChoice({
  twists,
  chosenId,
  onChoose,
}: {
  twists: readonly Twist[]
  chosenId: string | null
  onChoose: (id: string | null) => void
}) {
  if (!twists.length) return null
  const chosen = twists.find((twist) => twist.id === chosenId)

  return (
    <SetupPanel>
      <fieldset>
        <legend className="eyebrow">
          Mission twist <span className="text-faint">· optional</span>
        </legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          <Button
            variant="outline"
            aria-pressed={chosenId === null}
            className={`h-auto justify-start px-3 py-2 text-left text-sm font-bold whitespace-normal uppercase ${
              chosenId === null ? CHOSEN : CHOOSABLE
            }`}
            onClick={() => onChoose(null)}
          >
            No twist
          </Button>
          {twists.map((twist) => (
            // The mark that reads it is its own control beside the one that picks it,
            // so a press to find out what a twist does is never a press that takes it.
            <div key={twist.id} className="relative">
              <Button
                variant="outline"
                aria-pressed={chosenId === twist.id}
                className={`h-auto w-full justify-start py-2 pr-9 pl-3 text-left text-sm font-bold whitespace-normal uppercase ${
                  chosenId === twist.id ? CHOSEN : CHOOSABLE
                }`}
                onClick={() => onChoose(twist.id)}
              >
                {twist.name}
              </Button>
              <TwistInfo twist={twist} />
            </div>
          ))}
        </div>
        {/*
         * Said plainly, and said again on the twist it is about: what a twist changes is
         * the table's to play, and a twist that rewrites the primaries is one this app
         * will go on contradicting for the whole battle if nobody is told.
         */}
        <SetupNote className="mt-3">
          A twist is played at the table. Praetorium records which one is in play and shows what it says — it does not change the missions,
          cards or caps it tracks.
        </SetupNote>
        {chosen && changesPrimary(chosen) ? (
          <SetupNote className="mt-2 border-discarded/60 text-discarded">
            {chosen.name} rewrites the Primary Mission cards. Praetorium will keep naming the missions this matchup gave each side, so score
            the primary the twist actually leaves you holding.
          </SetupNote>
        ) : null}
      </fieldset>
    </SetupPanel>
  )
}
