import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { FullPageState } from '../../components/PageState'
import { battleArrivalQuery } from '../../queries'

/**
 * A battle link the service does not know yet. A battle created on a device reaches the
 * service a moment after its creator's screen shows the link, so this keeps asking and opens
 * the battle once it arrives; a link that never names one stays here.
 */
export function BattleNotFound({ token }: { token: string }) {
  const router = useRouter()
  const { data: screen } = useQuery(battleArrivalQuery(token))
  useEffect(() => {
    if (screen) void router.invalidate({ filter: (match) => match.routeId === '/battles/$token' })
  }, [router, screen])
  return (
    <FullPageState
      eyebrow="404"
      title="Nothing here"
      explanation="This page does not exist or its current data is unavailable. Check the link and try again."
    />
  )
}
