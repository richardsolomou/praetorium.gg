import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** Base UI selects cannot hold an empty value, so declining a choice needs a token. */
const NONE = '__none__'

export type LoadoutUnit = {
  name: string
  points: number
  size: { min: number; max: number; models: number; resizable: boolean }
  choices: { key: string; name: string; chosen: string; options: { id: string; name: string; points: number }[] }[]
}

type Props = { unit: LoadoutUnit | null; onChoose: (key: string, optionId: string) => void }

/**
 * What the selected unit is carrying.
 *
 * Squad size is not here: it is on the card, where the roster is, because one
 * control with one name is worth more than two that agree.
 *
 * Nothing is typed. Every option comes from the datasheet with the price the data
 * gives it, and declining an optional one is itself an option — a choice a player
 * cannot take back would be worse than one they never made.
 */
export function Loadout({ unit, onChoose }: Props) {
  if (!unit) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-52 text-center text-xs text-faint">Select a unit from the roster to edit its loadout.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-2 border-b border-edge p-2.5">
        <h2 className="truncate text-sm leading-tight">{unit.name}</h2>
        <span className="chip shrink-0">{unit.points} pts</span>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2.5">
        {unit.choices.length ? (
          unit.choices.map((choice) => (
            <div key={choice.key}>
              <p className="eyebrow">{choice.name}</p>
              <Select
                value={choice.chosen || NONE}
                onValueChange={(value: string | null) => onChoose(choice.key, value === NONE ? '' : (value ?? ''))}
              >
                <SelectTrigger className="mt-1.5 h-9 w-full text-sm" aria-label={`${unit.name} ${choice.name}`}>
                  <SelectValue>{(value: unknown) => choice.options.find((option) => option.id === value)?.name ?? 'Choose'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {choice.options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                      {option.points ? ` (+${option.points})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))
        ) : (
          <p className="text-xs text-faint">Nothing on this datasheet is optional.</p>
        )}
      </div>
    </div>
  )
}
