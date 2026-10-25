import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OnboardingTaskId } from '../../../core/onboarding'
import { openOnboarding, type OnboardingStepId } from './onboarding'

export function GuideHelp({ task, step, children }: { task: OnboardingTaskId; step?: OnboardingStepId; children: string }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => openOnboarding(task, step)}>
      <CircleHelp className="size-4" /> {children}
    </Button>
  )
}
