import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { version } from '../../../../package.json'
import { Button } from '@/components/ui/button'
import { releaseQuery } from '../../queries'
import { newerRelease } from './releaseUpdate'

export function ReleaseUpdateNotice() {
  const { data, isError } = useQuery(releaseQuery())
  if (isError || !data || !newerRelease(version, data.version)) return null
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
