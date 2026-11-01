import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OnboardingTaskId } from '../../../core/onboarding'
import { openOnboarding, type OnboardingStepId } from './onboarding'

/**
 * `icon` shows only the icon, naming the guide to assistive technology and on hover, as a dialog's header actions are.
 * Without it, phones still get only the icon so the guide sits beside a row's real actions without crowding them.
 */
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
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title={children}
      className="max-sm:w-7 max-sm:px-0"
      onClick={() => openOnboarding(task, step)}
    >
      <CircleHelp className="size-4" /> <span className="max-sm:sr-only">{children}</span>
    </Button>
  )
}
