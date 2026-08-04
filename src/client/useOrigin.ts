import { useEffect, useState } from 'react'

/** Empty until mounted, so the server and the first render agree. */
export function useOrigin() {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  return origin
}
