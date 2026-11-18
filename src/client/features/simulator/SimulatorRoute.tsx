import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CombatSimulator } from './CombatSimulator'

/** The simulator at its address: `s` is a shared setup, and `from` is kept for telemetry, then dropped from the address. */
export function SimulatorRoute({ s, from }: { s?: string; from?: 'datasheet' }) {
  const [reference] = useState(from)
  const [initial] = useState(s)
  const navigate = useNavigate({ from: '/simulator' })
  // Read when sharing rather than passed down, so writing each change into the address never redraws the simulator.
  const shared = useRef(s)
  const address = useRef(s)
  useEffect(() => {
    if (from) void navigate({ search: ({ from: _from, ...rest }) => rest, replace: true, resetScroll: false })
  }, [from, navigate])
  const share = useCallback(
    (next: string | undefined) => {
      shared.current = next
      if (next !== address.current) void navigate({ search: next ? { s: next } : {}, replace: true, resetScroll: false })
    },
    [navigate],
  )
  // An address the simulator did not write gives way to the simulation on screen.
  useEffect(() => {
    address.current = s
    if (s !== shared.current) share(shared.current)
  }, [s, share])
  return <CombatSimulator shared={initial} onShare={share} reference={reference} />
}
