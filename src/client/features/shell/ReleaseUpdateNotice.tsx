import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { releaseQuery } from '../../queries'
import { staleBuildRelease } from '../../releaseUpdate'
import { retireDeviceConstruction } from '../../functions'
import { FloatingNotice } from '../../components/FloatingNotice'
import { offlineData } from '../../offline/runtime'

export function ReleaseUpdateNotice() {
  const router = useRouter()
  const release = useQuery(releaseQuery())
  const outdated = Boolean(staleBuildRelease(useQueryClient()))
  useEffect(() => {
    if (outdated) retireDeviceConstruction()
  }, [outdated])
  // Nothing else returns a saved copy to the live app, and its account reads keep failing until it does.
  const backOnline = Boolean(offlineData()) && release.isFetchedAfterMount && release.isSuccess && !release.isRefetchError
  useEffect(() => {
    if (backOnline) posthog.capture('saved_copy_back_online_shown')
  }, [backOnline])
  if (backOnline)
    return (
      <FloatingNotice aria-label="Back online">
        <span className="px-2 font-medium text-bone">You’re back online.</span>
        <Button
          size="sm"
          onClick={() => {
            posthog.capture('saved_copy_back_online_reloaded')
            if (window.ReactNativeWebView)
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'offline-retry', path: router.state.location.href }))
            else window.location.reload()
          }}
        >
          <RefreshCw />
          Reload
        </Button>
      </FloatingNotice>
    )
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
