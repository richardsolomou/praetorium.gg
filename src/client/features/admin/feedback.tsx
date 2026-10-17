import type { ReactNode } from 'react'

export function Notice({ children }: { children: ReactNode }) {
  return <output className="block text-sm text-achieved">{children}</output>
}
