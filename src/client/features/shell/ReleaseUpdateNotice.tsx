import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { releaseQuery } from '../../queries'
import { deviceEngineRetired, staleBuildRelease } from '../../releaseUpdate'
import { retireDeviceConstruction } from '../../functions'
import { FloatingNotice } from '../../components/FloatingNotice'
import { offlineData } from '../../offline/runtime'

export function ReleaseUpdateNotice() {
  const router = useRouter()
  const release = useQuery(releaseQuery())
  const client = useQueryClient()
  const latest = staleBuildRelease(client)
  const retired = deviceEngineRetired(client)
  const [dismissed, setDismissed] = useState<string | null>(null)
  useEffect(() => {
    if (retired) retireDeviceConstruction()
  }, [retired])
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
  // The next page change loads the new release anyway, so a dismissed notice stays away until a later one lands.
  if (!latest || latest === dismissed) return null
  return (
    <FloatingNotice aria-label="Release update" data-release-update>
      <span className="px-2 font-medium text-bone">Praetorium has been updated.</span>
      <Button size="sm" onClick={() => window.location.reload()}>
        <RefreshCw />
        Refresh
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setDismissed(latest)}>
        Later
      </Button>
    </FloatingNotice>
  )
}
