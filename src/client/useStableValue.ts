import { replaceEqualDeep } from '@tanstack/react-query'
import { useState } from 'react'

/** Keeps the previous reference while `value` stays deep-equal, so effects can depend on derived plain data. */
export function useStableValue<T>(value: T): T {
  const [stable, setStable] = useState(value)
  const next = replaceEqualDeep(stable, value)
  if (next !== stable) setStable(next)
  return next
}
