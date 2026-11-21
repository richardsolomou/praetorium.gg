import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import {
  BATTLE_CHOICE_SCOPE_LIMIT,
  type BattleChoicePicks,
  battleChoicePicksSchema,
  battleChoiceScopeSchema,
  NO_BATTLE_CHOICE_PICKS,
} from '../../../../core/battleChoicePicks'
import { setBattleChoices } from '../../../functions'
import { battleChoicesQuery, meQuery } from '../../../queries'
import { parseStored, readStoredValue, useStoredValue, writeStoredValue } from '../../../storedValue'

/** A visitor's picks, oldest scope first, kept in this browser as an account keeps a player's. */
const VISITOR_KEY = 'praetorium.battle-choices'
const visitorSchema = z.array(z.tuple([battleChoiceScopeSchema, battleChoicePicksSchema]))
const visitorPicks = (stored: string | null) => parseStored(visitorSchema, stored) ?? []

/** The player's picks for one list or battle: their account's once signed in, otherwise this browser's. */
export function useBattleChoicePicks(scope: string | undefined) {
  const queryClient = useQueryClient()
  const { data: me } = useQuery(meQuery())
  const signedIn = Boolean(me)
  const account = useQuery({ ...battleChoicesQuery(scope ?? ''), enabled: signedIn && scope !== undefined })
  const browser = visitorPicks(useStoredValue(VISITOR_KEY))
  const save = useMutation({
    // One scope's writes go in order, so a quick change of mind never lands before the pick it replaces.
    scope: { id: `battle-choices:${scope}` },
    mutationFn: (picks: BattleChoicePicks) => setBattleChoices({ data: { scope: scope!, picks } }),
  })
  const picks = signedIn ? account.data : browser.find(([candidate]) => candidate === scope)?.[1]
  return {
    picks: picks ?? NO_BATTLE_CHOICE_PICKS,
    save: (next: BattleChoicePicks) => {
      if (!scope || me === undefined) return
      if (!signedIn) {
        const others = visitorPicks(readStoredValue(VISITOR_KEY)).filter(([candidate]) => candidate !== scope)
        writeStoredValue(VISITOR_KEY, JSON.stringify([...others, [scope, next]].slice(-BATTLE_CHOICE_SCOPE_LIMIT)))
        return
      }
      // A refused write keeps the pick on this page, as it always stayed until a reload.
      const { queryKey } = battleChoicesQuery(scope)
      void queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData(queryKey, next)
      save.mutate(next)
    },
  }
}
