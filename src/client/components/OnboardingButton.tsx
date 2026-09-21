import { useQuery } from '@tanstack/react-query'
import { Map } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolvedOnboardingTasks } from '../../core/onboarding'
import { onboardingTasks, openOnboarding } from '../onboarding'
import { meQuery, onboardingQuery } from '../queries'

export function OnboardingButton() {
  const { data: me } = useQuery(meQuery())
  return me ? <AccountOnboardingButton /> : null
}

function AccountOnboardingButton() {
  const { data } = useQuery(onboardingQuery())
  const resolved = data ? resolvedOnboardingTasks(data).size : 0
  const progress = (resolved / onboardingTasks.length) * 100
  const label = data ? `Getting started, ${resolved} of ${onboardingTasks.length} tasks resolved` : 'Getting started'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="shrink-0 text-dim hover:bg-raised hover:text-info"
      aria-label={label}
      title="Getting started"
      onClick={openOnboarding}
    >
      <span className="relative grid size-7 place-items-center">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="absolute inset-0 size-7 -rotate-90">
          <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2" className="stroke-edge-strong" />
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            pathLength="100"
            strokeWidth="2"
            strokeDasharray="100"
            strokeDashoffset={100 - progress}
            strokeLinecap="round"
            className="stroke-info transition-[stroke-dashoffset]"
          />
        </svg>
        <Map className="size-3.5" />
      </span>
    </Button>
  )
}
