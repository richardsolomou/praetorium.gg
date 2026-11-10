import { useState } from 'react'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../../core/rosterLibrary'

const KEPT_FOR = 60 * 60 * 24 * 365

/** The skeleton rows a library with no remembered count draws. */
export const DEFAULT_ROSTER_ROWS = 8

/** The rows the library last showed, at least one so loading stays visible and never more than its first page. */
export function keptRosterRows(value: string | undefined) {
  const rows = Number(value)
  return Number.isInteger(rows) ? Math.min(Math.max(rows, 1), ROSTER_LIBRARY_BATCH_SIZE) : DEFAULT_ROSTER_ROWS
}

/** Sets for a year, or given null expires, a cookie the `/rosters` page reads to draw its first frame. */
export function setRosterCookie(name: string, value: string | null) {
  if (typeof document === 'undefined') return
  const age = `; Max-Age=${value === null ? 0 : KEPT_FOR}`
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${value ?? ''}; Path=/rosters; SameSite=Lax${age}${secure}`
}

/**
 * A choice kept in a `/rosters` cookie: the loader's while rendering on the server, so hydration matches, then the
 * browser's own, which a cached loader result can predate. Reading it here spares invalidating the route, which scrolls to the top.
 */
export function useRosterCookieChoice<T>(loaded: T, name: string, read: (value: string | undefined) => T) {
  return useState(() => {
    if (typeof document === 'undefined') return loaded
    const cookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${name}=`))
      ?.slice(name.length + 1)
    return read(cookie)
  })
}
