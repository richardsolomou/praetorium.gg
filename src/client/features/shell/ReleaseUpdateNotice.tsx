import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { releaseQuery } from '../../queries'
import { staleBuildRelease } from '../../releaseUpdate'
import { retireDeviceConstruction } from '../../functions'
import { FloatingNotice } from '../../components/FloatingNotice'

export function ReleaseUpdateNotice() {
  useQuery(releaseQuery())
  const outdated = Boolean(staleBuildRelease(useQueryClient()))
  useEffect(() => {
    if (outdated) retireDeviceConstruction()
  }, [outdated])
  if (!outdated) return null
  return (
    <FloatingNotice aria-label="Release update" data-release-update>
      <span className="px-2 font-medium text-bone">Praetorium has been updated.</span>
      <Button size="sm" onClick={() => window.location.reload()}>
        <RefreshCw />
        Refresh
      </Button>
    </FloatingNotice>
  )
}
