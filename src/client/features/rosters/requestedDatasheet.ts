import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'

/** A datasheet a reference page asked to add to a list, dropped once the builder has answered. */
export const requestedDatasheetSearch = (search: Record<string, unknown>): { add?: string } =>
  typeof search.add === 'string' && search.add && search.add.length <= 64 ? { add: search.add } : {}

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
