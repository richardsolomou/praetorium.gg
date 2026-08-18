import { useEffect, useState } from 'react'

const STORAGE_KEY = 'praetorium:favourite-factions'

export function useFavouriteFactions() {
  const [favourites, setFavourites] = useState<Set<string>>(new Set())

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed)) setFavourites(new Set(parsed.filter((value): value is string => typeof value === 'string')))
  }, [])

  const toggleFavourite = (id: string) => {
    setFavourites((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  return { favourites, toggleFavourite }
}

export const favouritesFirst = <T extends { id: string }>(entries: readonly T[], favourites: ReadonlySet<string>) =>
  entries.toSorted((left, right) => Number(favourites.has(right.id)) - Number(favourites.has(left.id)))
