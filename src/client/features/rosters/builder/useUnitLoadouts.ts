import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UnitLoadout } from '../../../../core/unitLoadouts'
import { deleteUnitLoadout, renameUnitLoadout, saveUnitLoadout } from '../../../functions'
import { unitLoadoutsKey, unitLoadoutsQuery } from '../../../queries'

export function useUnitLoadouts(enabled: boolean) {
  const queryClient = useQueryClient()
  const query = unitLoadoutsQuery()
  const refresh = () => queryClient.invalidateQueries({ queryKey: unitLoadoutsKey() })
  return {
    loadouts: useQuery({ ...query, enabled }),
    save: useMutation({
      mutationFn: (loadout: UnitLoadout) => saveUnitLoadout({ data: { id: crypto.randomUUID(), ...loadout } }),
      onSuccess: refresh,
    }),
    rename: useMutation({
      mutationFn: (data: { id: string; name: string }) => renameUnitLoadout({ data }),
      onSuccess: (_result, { id, name }) => {
        queryClient.setQueryData(query.queryKey, (current) =>
          current?.map((loadout) => (loadout.id === id ? { ...loadout, name } : loadout)),
        )
        return refresh()
      },
    }),
    remove: useMutation({ mutationFn: (id: string) => deleteUnitLoadout({ data: { id } }), onSuccess: refresh }),
  }
}
