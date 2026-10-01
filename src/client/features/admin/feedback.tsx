import type { ReactNode } from 'react'
import { errorMessage } from '../../queryClient'

export function Problem({ error }: { error: unknown }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {errorMessage(error)}
    </p>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return <output className="block text-sm text-achieved">{children}</output>
}
