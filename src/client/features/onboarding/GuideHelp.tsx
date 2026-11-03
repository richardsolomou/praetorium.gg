import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OnboardingTaskId } from '../../../core/onboarding'
import { openOnboarding, type OnboardingStepId } from './onboarding'

/** A question mark for a corner of a page band, dialog or panel; `children` names the guide to assistive technology and on hover. */
export function GuideHelp({ task, step, children }: { task: OnboardingTaskId; step?: OnboardingStepId; children: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={children}
      title={children}
      className="text-dim"
      onClick={() => openOnboarding(task, step)}
    >
      <CircleHelp />
    </Button>
  )
}
