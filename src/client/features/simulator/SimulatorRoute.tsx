import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { CombatSimulator } from './CombatSimulator'

/** The simulator at its address: `s` is a shared setup, and `from` is kept for telemetry, then dropped from the address. */
export function SimulatorRoute({ s, from }: { s?: string; from?: 'datasheet' }) {
  const [reference] = useState(from)
  const navigate = useNavigate({ from: '/simulator' })
  useEffect(() => {
    if (from) void navigate({ search: ({ from: _from, ...rest }) => rest, replace: true, resetScroll: false })
  }, [from, navigate])
  const share = useCallback(
    (shared: string | undefined) => void navigate({ search: shared ? { s: shared } : {}, replace: true, resetScroll: false }),
    [navigate],
  )
  return <CombatSimulator shared={s} onShare={share} reference={reference} />
}
