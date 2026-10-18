import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UnitLoadout } from '../../../../core/unitLoadouts'
import { deleteUnitLoadout, saveUnitLoadout } from '../../../functions'
import { unitLoadoutsKey, unitLoadoutsQuery } from '../../../queries'

export function useUnitLoadouts(enabled: boolean) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: unitLoadoutsKey() })
  return {
    loadouts: useQuery({ ...unitLoadoutsQuery(), enabled }),
    save: useMutation({
      mutationFn: (loadout: UnitLoadout) => saveUnitLoadout({ data: { id: crypto.randomUUID(), ...loadout } }),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => deleteUnitLoadout({ data: { id } }), onSuccess: refresh }),
  }
}
