import { Info } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { CARD_NAME } from './battle/tints'
import { RuleText } from './RuleText'

/** An optional twist a mission pack prints, which changes one rule for the whole battle. */
export type Twist = { id: string; name: string; lore: string | null; rules: string | null }

/**
 * Whether a twist rewrites the Primary Mission cards, which this app does not follow.
 *
 * A pack prints twists that exchange the two sides' primaries, and one that replaces
 * both with a card chosen from a list. The missions here are read from the matchup
 * and the app has no structured way to know which card a twist substitutes, so the
 * twist is recorded and printed but never applied.
 *
 * Read off the pack's own words, and only ever to add a warning: a twist this misses
 * is a twist shown without one, exactly as every twist was before. Nothing about what
 * the app tracks turns on the answer.
 */
export const changesPrimary = (twist: Twist) => /primary mission/i.test(twist.rules ?? '')

/**
 * What a twist changes, opened from whatever names it.
 *
 * A twist bends a rule for every turn of the game, so what it says has to be one
 * press away wherever it appears — while it is being chosen, and again mid-battle
 * when someone asks what it was. Only ever one press: printed underneath, its rules
 * text was a wall of prose on a screen that was in the middle of asking a question.
 */
function TwistDialog({ twist, trigger, children }: { twist: Twist; trigger: ReactElement; children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger render={trigger}>{children}</DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto border border-edge bg-panel text-bone sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="uppercase">{twist.name}</DialogTitle>
          <DialogDescription className="text-dim">{twist.lore ?? 'What this twist changes for the whole battle.'}</DialogDescription>
        </DialogHeader>
        {twist.rules ? <RuleText text={twist.rules} /> : null}
      </DialogContent>
    </Dialog>
  )
}

/** The twist's name, which opens it. For the places that only report what is in play. */
export function TwistName({ twist, className = '' }: { twist: Twist; className?: string }) {
  if (!twist.rules) return <span className={`${CARD_NAME} ${className}`}>{twist.name}</span>
  return (
    <TwistDialog
      twist={twist}
      trigger={<button type="button" aria-label={`Read ${twist.name}`} className={`${CARD_NAME} text-left hover:underline ${className}`} />}
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
        <button
          type="button"
          aria-label={`Read ${twist.name}`}
          title={`What ${twist.name} changes`}
          className="absolute top-1 right-1 grid size-7 place-items-center rounded-sm text-dim hover:bg-raised hover:text-bone"
        />
      }
    >
      <Info className="size-4" />
    </TwistDialog>
  )
}
