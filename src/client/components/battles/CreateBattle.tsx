import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GAME_SIZES } from '../../../core/battle'
import { createBattle } from '../../../server/functions'
import { battlesQuery, gameReferencesQuery, opponentsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'

/** The two shapes a battle can take. A 2v1 splits the points across the allied pair. */
const FORMATS = [
  { key: 'duel', name: '1v1', detail: 'One army each' },
  { key: 'team', name: '2v1', detail: 'Two allies share a side' },
] as const

/**
 * Opening a battle: who is in it, how big it is, and which mission pack it plays.
 *
 * Practice is not a third format. A practice opponent is an account that holds a
 * seat and never signs in, so playing one is a 1v1 like any other — and a 2v1 with
 * one in it is a 2v1. Both formats are therefore whoever is in the seats.
 *
 * Everything else about the game is settled together at the table once the battle
 * exists, which is why this asks for so little.
 */
export function CreateBattle() {
  const { data: opponents = [] } = useQuery(opponentsQuery())
  const { data: references } = useQuery(gameReferencesQuery())
  const [open, setOpen] = useState(false)
  const [opponentIds, setOpponentIds] = useState<string[]>([])
  const [teamBattle, setTeamBattle] = useState(false)
  const [limit, setLimit] = useState(2000)
  const [missionPackId, setMissionPackId] = useState<string | null>(references?.packs[0]?.id ?? null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: () =>
      createBattle({
        data: {
          opponentIds,
          solo: false,
          limit,
          missionPackId,
        },
      }),
    onSuccess: async ({ token }) => {
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      return navigate({ to: '/battles/$token', params: { token } })
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>New battle</DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-none border-edge bg-panel p-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl uppercase">Start a battle</DialogTitle>
          <DialogDescription>Choose who is playing. A practice opponent needs no friend and no second device.</DialogDescription>
        </DialogHeader>
        <fieldset>
          <legend className="eyebrow">Format</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {FORMATS.map((format) => {
              const chosen = format.key === (teamBattle ? 'team' : 'duel')
              return (
                <Button
                  key={format.key}
                  variant={chosen ? 'default' : 'outline'}
                  aria-pressed={chosen}
                  className={`h-auto flex-col items-start gap-0.5 px-2.5 py-2 text-left ${chosen ? 'bg-parchment text-parchment-ink hover:bg-parchment/80' : ''}`}
                  onClick={() => {
                    setTeamBattle(format.key === 'team')
                    if (format.key !== 'team') setOpponentIds((ids) => ids.slice(0, 1))
                  }}
                >
                  <span className="font-bold uppercase">{format.name}</span>
                  <span
                    className={`text-[0.625rem] leading-tight font-normal whitespace-normal ${chosen ? 'text-parchment-ink/75' : 'text-dim'}`}
                  >
                    {format.detail}
                  </span>
                </Button>
              )
            })}
          </div>
        </fieldset>
        {opponents.length ? (
          <div>
            <Label htmlFor="battle-opponent" className="eyebrow">
              {teamBattle ? 'Opponents' : 'Opponent'}
            </Label>
            {/* The badge is decorative: an option is named for its account, so the name is the name. */}
            <Select value={opponentIds[0] ?? null} onValueChange={(id) => id && setOpponentIds((current) => [id, ...current.slice(1)])}>
              <SelectTrigger id="battle-opponent" className="mt-1 h-11 w-full rounded-none border-edge bg-sunken">
                <SelectValue placeholder="Choose a player">
                  {(value: unknown) => opponents.find((opponent) => opponent.id === value)?.name ?? 'Choose a player'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {opponents
                  .filter((opponent) => opponent.id !== opponentIds[1])
                  .map((opponent) => (
                    <SelectItem key={opponent.id} value={opponent.id}>
                      {opponent.name}
                      {opponent.automated ? (
                        <span className="ml-2 text-xs text-dim uppercase" aria-hidden>
                          practice
                        </span>
                      ) : null}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {teamBattle ? (
              <Select
                value={opponentIds[1] ?? null}
                disabled={!opponentIds[0]}
                onValueChange={(id) => id && setOpponentIds((current) => (current[0] ? [current[0], id] : current))}
              >
                <SelectTrigger aria-label="Their ally" className="mt-2 h-11 w-full rounded-none border-edge bg-sunken">
                  <SelectValue placeholder="Choose their ally">
                    {(value: unknown) => opponents.find((opponent) => opponent.id === value)?.name ?? 'Choose their ally'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {opponents
                    .filter((opponent) => opponent.id !== opponentIds[0])
                    .map((opponent) => (
                      <SelectItem key={opponent.id} value={opponent.id}>
                        {opponent.name}
                        {opponent.automated ? (
                          <span className="ml-2 text-xs text-dim uppercase" aria-hidden>
                            practice
                          </span>
                        ) : null}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        ) : (
          <p className="border border-edge bg-sunken p-3 text-sm text-dim">This instance seats nobody you can play yet.</p>
        )}
        <div>
          <Label className="eyebrow">Battle size</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {GAME_SIZES.map((size) => (
              <Button
                key={size.limit}
                variant={limit === size.limit ? 'default' : 'outline'}
                size="sm"
                className={limit === size.limit ? 'bg-parchment text-parchment-ink hover:bg-parchment/80' : undefined}
                onClick={() => setLimit(size.limit)}
              >
                {size.name} · {size.limit}
              </Button>
            ))}
          </div>
        </div>
        {references?.packs.length ? (
          <div>
            <Label className="eyebrow">Mission pack</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {references.packs.map((pack) => (
                <Button
                  key={pack.id}
                  variant={missionPackId === pack.id ? 'default' : 'outline'}
                  size="sm"
                  className={missionPackId === pack.id ? 'bg-parchment text-parchment-ink hover:bg-parchment/80' : undefined}
                  onClick={() => setMissionPackId(pack.id)}
                >
                  {pack.name}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {create.error ? <p className="text-sm text-destructive">{errorMessage(create.error)}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={opponentIds.length < (teamBattle ? 2 : 1) || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create battle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
