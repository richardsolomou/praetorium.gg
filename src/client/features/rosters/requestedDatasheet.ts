import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { searchText } from '../../searchParams'

/** A datasheet a reference page asked to add to a list, dropped once the builder has answered. */
export const requestedDatasheetSearch = (search: Record<string, unknown>) => ({ add: searchText(search.add, 64) })

export function useRequestedDatasheet(add: string | undefined) {
  const navigate = useNavigate()
  return useMemo(
    () =>
      add
        ? {
            entryId: add,
            onSettled: () => void navigate({ to: '.', search: (current) => ({ ...current, add: undefined }), replace: true }),
          }
        : undefined,
    [add, navigate],
  )
}
