import { useEffect, useState } from 'react'

/** False on the server and the first client render, true afterwards, so per-user
 * ordering applies only once the server markup has hydrated. */
export function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}
