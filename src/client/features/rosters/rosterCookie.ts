/** Sets, or given null expires, a cookie the `/rosters` page reads to draw its first frame; without `maxAge` it ends with the session. */
export function setRosterCookie(name: string, value: string | null, maxAge?: number) {
  if (typeof document === 'undefined') return
  const age = value === null ? '; Max-Age=0' : maxAge ? `; Max-Age=${maxAge}` : ''
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${value ?? ''}; Path=/rosters; SameSite=Lax${age}${secure}`
}
