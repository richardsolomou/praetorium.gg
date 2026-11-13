import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { battleSizeOptionLabel, GAME_SIZES, isKotcLimit } from '../../../../core/battle'
import type { BattleView } from '../../../../core/battleView'
import { Choice, type ChoiceOption } from '../../../components/Choice'
import { SearchableSelect, type SearchableGroup } from '../../../components/SearchableSelect'
import { gameReferencesQuery } from '../../../queries'
import type { SendCommand } from '../useCommand'
import { BATTLE_SIZE_CONTROL, CHOOSABLE, CHOSEN } from './chrome'
import { GroupChoice } from './GroupChoice'
import type { Configure } from './sections'

/** Every matched-play size, named and priced, for the one control that asks for it; King of the Colosseum is a duel. */
const sizeOptions = (teamBattle: boolean): SearchableGroup[] => [
  {
    label: '',
    items: GAME_SIZES.filter((size) => !teamBattle || !isKotcLimit(size.limit)).map((size) => ({
      label: battleSizeOptionLabel(size),
      value: String(size.limit),
    })),
  },
]

/** Each side's time for the whole battle; a tournament round usually gives each side half of it. */
const CLOCK_LIMITS: ChoiceOption<string>[] = [
  { value: '0', name: 'No limit', detail: 'Times each turn' },
  ...[60, 75, 90, 105, 120].map((minutes) => ({ value: String(minutes), name: `${minutes} min`, detail: 'Each side' })),
]

/** How the battle is tracked, its size, mission pack, chess clock and group, which the whole table shares. */
export function FormatStep({
  view,
  send,
  configure,
  busy,
  sizeFixed,
}: {
  view: BattleView
  send: SendCommand
  configure: Configure
  busy: boolean
  /** Set by a sealed event or by the rosters, so the size has no control. */
  sizeFixed: boolean
}) {
  const { data: references } = useQuery(gameReferencesQuery())
  const manual = view.settings.manual === true
  const team = view.settings.teamBattle
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {view.sealedEventToken ? null : (
        <div className="sm:col-span-2">
          <Choice
            label="How you track it"
            value={manual ? 'manual' : 'guided'}
            options={[
              {
                value: 'guided',
                name: 'Guided',
                count: 'Recommended',
                detail:
                  'Draws your mission cards, asks what you scored each turn and keeps your CP. The result, replay and stats go in your record.',
              },
              {
                value: 'manual',
                name: 'Manual',
                detail: 'A scoreboard. You enter scores and CP from your own cards, with no prompts or caps.',
              },
            ]}
            columns={2}
            disabled={busy}
            onChange={(tracking) => {
              if ((tracking === 'manual') !== manual)
                configure(
                  tracking === 'manual'
                    ? { manual: true, missionPackId: null, twistId: null, terrainLayoutId: null }
                    : { manual: false, missionPackId: references?.packs[0]?.id ?? null },
                )
            }}
          />
        </div>
      )}
      {sizeFixed ? null : (
        <div>
          <Label htmlFor={BATTLE_SIZE_CONTROL} className="eyebrow">
            Battle size
          </Label>
          <SearchableSelect
            id={BATTLE_SIZE_CONTROL}
            ariaLabel="Battle size"
            groups={sizeOptions(team)}
            value={view.settings.limit === null ? '' : String(view.settings.limit)}
            onValueChange={(value) => configure({ limit: Number(value) })}
            placeholder="Choose a battle size"
            searchPlaceholder="Search sizes…"
            className="mt-1 h-11"
          />
        </div>
      )}
      {references && references.packs.length > 1 && !manual ? (
        <fieldset>
          <legend className="eyebrow">Mission pack</legend>
          <div className="mt-1 grid gap-2">
            {references.packs.map((pack) => (
              <Button
                key={pack.id}
                variant="outline"
                aria-pressed={view.settings.missionPackId === pack.id}
                className={`h-auto min-h-11 justify-start px-3 py-2 text-left text-sm font-bold uppercase ${
                  view.settings.missionPackId === pack.id ? CHOSEN : CHOOSABLE
                }`}
                onClick={() => configure({ missionPackId: pack.id, twistId: null })}
              >
                {pack.name}
              </Button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="sm:col-span-2">
        <Choice
          label="Chess clock"
          value={String(view.settings.clockLimitMinutes ?? 0)}
          options={CLOCK_LIMITS}
          columns={3}
          disabled={busy}
          onChange={(minutes) => configure({ clockLimitMinutes: Number(minutes) || null })}
        />
      </div>
      {view.sealedEventToken || manual ? null : <GroupChoice view={view} send={send} disabled={busy} className="sm:col-span-2" />}
    </div>
  )
}
