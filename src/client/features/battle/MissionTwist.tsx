import { Info } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DialogBody, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/Dialog'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'
import { CARD_NAME, CARD_NAME_LINK } from './battleTints'
import { RuleSummaryText } from '../../components/RuleSummaryText'
import type { RuleSummary } from '../../../contracts/rules'
import type { MissionTwist } from '../../../contracts/missions'
import { useMissionSummary } from '../../ruleSummaries'

/** An optional twist a mission pack prints, which changes one rule for the whole battle. */
export type Twist = MissionTwist

/** Warn when a printed twist changes primary missions: the app records the twist but cannot apply its unstructured replacement rules. */
export const changesPrimary = (twist: Twist) => twist.changesPrimary === true

/**
 * What a twist changes, opened from whatever names it.
 *
 * A twist bends a rule for every turn of the game, so its text stays one press away
 * wherever it appears rather than printed inline on a screen that is asking a question.
 */
function TwistDialog({
  twist,
  summary,
  trigger,
  children,
}: {
  twist: Twist
  summary: RuleSummary
  trigger: ReactElement
  children: ReactNode
}) {
  return (
    <BattlePromptDialog minimizedLabel={twist.name} resumeLabel="Return to twist">
      <DialogTrigger render={trigger}>{children}</DialogTrigger>
      <BattleDialogContent size="md">
        <DialogHeader>
          <DialogTitle>{twist.name}</DialogTitle>
          <DialogDescription>What this twist changes for the whole battle.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <RuleSummaryText summary={summary} />
        </DialogBody>
      </BattleDialogContent>
    </BattlePromptDialog>
  )
}

/** The twist's name, which opens it. For the places that only report what is in play. */
export function TwistName({ twist }: { twist: Twist }) {
  const summary = useMissionSummary('mission-twist', twist.id)
  if (!summary) return <span className={CARD_NAME}>{twist.name}</span>
  return (
    <TwistDialog
      twist={twist}
      summary={summary}
      trigger={<button type="button" aria-label={`Read ${twist.name}`} className={cn(CARD_NAME, CARD_NAME_LINK, 'text-left')} />}
    >
      {twist.name}
    </TwistDialog>
  )
}

/**
 * A mark beside a twist that is being chosen, which opens what it does.
 *
 * Its own control rather than part of the choice: reading a twist and picking it are
 * different intentions, and one press should never do the other. It sits on every
 * twist rather than only the chosen one, because which to pick is the question being
 * asked and the answer is in what each of them says.
 */
export function TwistInfo({ twist }: { twist: Twist }) {
  const summary = useMissionSummary('mission-twist', twist.id)
  if (!summary) return null
  return (
    <TwistDialog
      twist={twist}
      summary={summary}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Read ${twist.name}`}
          title={`What ${twist.name} changes`}
          className="absolute top-1 right-1 text-dim hover:text-bone"
        />
      }
    >
      <Info />
    </TwistDialog>
  )
}
