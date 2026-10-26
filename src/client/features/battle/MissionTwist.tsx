import { Info } from 'lucide-react'
import { loadedWords, useSourceTexts } from '../../sourceText'
import type { ReactElement, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DialogBody, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/Dialog'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'
import { CARD_NAME } from './battleTints'
import { RuleText } from '../../components/RuleText'

/** An optional twist a mission pack prints, which changes one rule for the whole battle. */
export type Twist = { id: string; name: string; lore: string | null; rules: string | null; changesPrimary?: boolean }

/** Warn when a printed twist changes primary missions: the app records the twist but cannot apply its unstructured replacement rules. */
export const changesPrimary = (twist: Twist) => twist.changesPrimary === true

/**
 * What a twist changes, opened from whatever names it.
 *
 * A twist bends a rule for every turn of the game, so its text stays one press away
 * wherever it appears rather than printed inline on a screen that is asking a question.
 */
function TwistDialog({ twist, trigger, children }: { twist: Twist; trigger: ReactElement; children: ReactNode }) {
  useSourceTexts([twist.lore])
  const lore = twist.lore ? loadedWords(twist.lore) : null
  return (
    <BattlePromptDialog minimizedLabel={twist.name} resumeLabel="Return to twist">
      <DialogTrigger render={trigger}>{children}</DialogTrigger>
      <BattleDialogContent size="md">
        <DialogHeader>
          <DialogTitle>{twist.name}</DialogTitle>
          <DialogDescription>{lore ?? 'What this twist changes for the whole battle.'}</DialogDescription>
        </DialogHeader>
        <DialogBody>{twist.rules ? <RuleText text={twist.rules} /> : null}</DialogBody>
      </BattleDialogContent>
    </BattlePromptDialog>
  )
}

/** The twist's name, which opens it. For the places that only report what is in play. */
export function TwistName({ twist, className = '' }: { twist: Twist; className?: string }) {
  if (!twist.rules) return <span className={cn(CARD_NAME, className)}>{twist.name}</span>
  return (
    <TwistDialog
      twist={twist}
      trigger={<button type="button" aria-label={`Read ${twist.name}`} className={cn(CARD_NAME, 'text-left hover:underline', className)} />}
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
  if (!twist.rules) return null
  return (
    <TwistDialog
      twist={twist}
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
