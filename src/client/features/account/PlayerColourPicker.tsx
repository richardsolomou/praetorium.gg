import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { PLAYER_COLOURS, playerColour, sideColour, type PlayerColour } from '../../../core/playerColours'
import { PlayerAvatar } from '../../components/PlayerAvatar'

/**
 * The colour that is a player's own: their name and their side in battles. Previewed
 * as both, because a deep colour shows its name lighter than its swatch.
 */
export function PlayerColourPicker({
  userId,
  name,
  image,
  colour,
  onChange,
}: {
  userId: string
  name: string
  image: string | null
  colour: string | null
  onChange: (colour: string | null) => void
}) {
  const automatic = playerColour({ id: userId })
  const chosen = playerColour({ id: userId, colour })
  const shown = sideColour(chosen)
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm leading-none font-medium">Player colour</legend>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-sunken/60 px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2" style={{ color: shown.text }}>
          <PlayerAvatar name={name} image={image} className="size-7 text-xs" />
          <span className="truncate text-base font-bold uppercase">{name}</span>
        </span>
        <span className="shrink-0 rounded-md px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: shown.fill, color: shown.ink }}>
          {chosen.name}
        </span>
      </div>
      <Option checked={colour === null} label={`Automatic, ${automatic.name}`} onChange={() => onChange(null)}>
        <span className="flex items-center gap-2 rounded-full border border-edge py-1 pr-3 pl-1 text-xs font-medium text-dim peer-checked:border-bone peer-checked:text-bone peer-focus-visible:ring-2 peer-focus-visible:ring-parchment">
          <Swatch colour={automatic} checked={colour === null} />
          Automatic · {automatic.name}
        </span>
      </Option>
      <div className="grid grid-cols-7 justify-items-start gap-2">
        {PLAYER_COLOURS.map((each) => (
          <Option key={each.key} checked={colour === each.key} label={each.name} onChange={() => onChange(each.key)}>
            <span className="block rounded-full ring-offset-2 ring-offset-panel peer-checked:ring-2 peer-checked:ring-bone peer-focus-visible:ring-2 peer-focus-visible:ring-parchment">
              <Swatch colour={each} checked={colour === each.key} />
            </span>
          </Option>
        ))}
      </div>
    </fieldset>
  )
}

function Option({ checked, label, onChange, children }: { checked: boolean; label: string; onChange: () => void; children: ReactNode }) {
  return (
    <label title={label} className="inline-block cursor-pointer">
      <input type="radio" name="player-colour" aria-label={label} checked={checked} onChange={onChange} className="peer sr-only" />
      {children}
    </label>
  )
}

function Swatch({ colour, checked }: { colour: PlayerColour; checked: boolean }) {
  const { fill, ink } = sideColour(colour)
  return (
    <span className="grid size-7 place-items-center rounded-full" style={{ backgroundColor: fill, color: ink }}>
      {checked ? <Check className="size-3.5" aria-hidden /> : null}
    </span>
  )
}
