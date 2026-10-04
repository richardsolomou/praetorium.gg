import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { version } from '../../../../package.json'
import { Button } from '@/components/ui/button'
import { releaseQuery } from '../../queries'
import { newerRelease } from './releaseUpdate'

export function ReleaseUpdateNotice() {
  const { data, isError } = useQuery(releaseQuery())
  const [dismissed, setDismissed] = useState<string>()
  if (isError || !data || !newerRelease(version, data.version) || dismissed === data.version) return null
  return (
    <aside
      aria-label="Release update"
      aria-live="polite"
      className="fixed right-3 bottom-20 left-3 z-40 flex flex-wrap items-center gap-2 border border-info/40 bg-panel p-3 text-sm shadow-xl sm:bottom-4 sm:left-auto sm:max-w-sm"
      data-print-hide
    >
      <p className="w-full font-semibold text-bone">New release ready</p>
      <p className="w-full text-dim">Save your changes, then refresh for v{data.version}.</p>
      <Button size="sm" onClick={() => window.location.reload()}>
        Refresh
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setDismissed(data.version)}>
        Later
      </Button>
    </aside>
  )
}
