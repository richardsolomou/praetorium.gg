import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { releaseQuery } from '../../queries'
import { staleBuildRelease } from '../../releaseUpdate'
import { retireDeviceConstruction } from '../../functions'

export function ReleaseUpdateNotice() {
  useQuery(releaseQuery())
  const outdated = Boolean(staleBuildRelease(useQueryClient()))
  useEffect(() => {
    if (outdated) retireDeviceConstruction()
  }, [outdated])
  if (!outdated) return null
  return (
    <aside
      aria-label="Release update"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-40 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 border border-edge-strong bg-panel p-2 text-sm shadow-lg"
      data-release-update
      data-print-hide
    >
      <span className="px-2 font-medium text-bone">Praetorium has been updated.</span>
      <Button size="sm" onClick={() => window.location.reload()}>
        <RefreshCw />
        Refresh
      </Button>
    </aside>
  )
}
