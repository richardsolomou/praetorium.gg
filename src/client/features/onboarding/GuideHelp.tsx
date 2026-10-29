import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OnboardingTaskId } from '../../../core/onboarding'
import { openOnboarding, type OnboardingStepId } from './onboarding'

/** `icon` shows only the icon, naming the guide to assistive technology and on hover, as a dialog's header actions are. */
export function GuideHelp({
  task,
  step,
  icon = false,
  children,
}: {
  task: OnboardingTaskId
  step?: OnboardingStepId
  icon?: boolean
  children: string
}) {
  if (icon)
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={children}
        title={children}
        onClick={() => openOnboarding(task, step)}
      >
        <CircleHelp />
      </Button>
    )
  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => openOnboarding(task, step)}>
      <CircleHelp className="size-4" /> {children}
    </Button>
  )
}
