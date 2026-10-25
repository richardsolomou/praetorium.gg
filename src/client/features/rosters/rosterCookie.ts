const KEPT_FOR = 60 * 60 * 24 * 365

/** Sets for a year, or given null expires, a cookie the `/rosters` page reads to draw its first frame. */
export function setRosterCookie(name: string, value: string | null) {
  if (typeof document === 'undefined') return
  const age = `; Max-Age=${value === null ? 0 : KEPT_FOR}`
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${value ?? ''}; Path=/rosters; SameSite=Lax${age}${secure}`
}
