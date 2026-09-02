import { useState } from 'react'
import { EllipsisVertical, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { type Command, isNewOrders, STRATAGEM_CP_MAX } from '../../../core/battle'
import { type BattleView } from '../../../core/battleView'
import type { Side } from '../../sides'
import { hiddenThisPhase, stratagemVisibleNow } from '../../stratagemVisibility'
import { RuleText } from '../RuleText'
import type { StratagemText } from './MissionCards'
import { CARD, CARD_NAME, HEADING } from './tints'

type ViewStratagem = BattleView['players'][number]['stratagems'][number]

type Props = {
  side: Side
  phase: BattleView['phase']
  coreKeys: ReadonlySet<string>
  actionable: boolean
  pending: boolean
  send: (command: Command) => void
  writtenFor: (key: string) => StratagemText | undefined
}

/** Only what can be played right now, unless the player asks for the rest. */
export function Stratagems({ side, phase, coreKeys, actionable, pending, send, writtenFor }: Props) {
  const [allPhases, setAllPhases] = useState(false)
  if (!side.stratagems.length) return null
  const otherPhases = hiddenThisPhase(side.stratagems, phase, side.isActive)

  return (
    // The rule that separates these from the missions belongs to the layout that
    // stacks them, so the panel draws it at the widths that need it.
    <section className="space-y-3">
      {/*
       * Said once, above the headings it explains: a pooled side plays both allies'
       * detachments out of one pool, and the rules on those cards still belong to the
       * army that brought them.
       */}
      {pooledDetachments(side.stratagems, coreKeys) > 1 ? (
        <p className="rounded-sm border border-edge bg-sunken px-2.5 py-1.5 text-[0.6875rem] text-dim">
          Each detachment’s rules affect the army that brought it and the enemy — not your ally’s units.
        </p>
      ) : null}
      {groups(side.stratagems, coreKeys).map((group) => {
        const shown = group.items.filter((stratagem) => stratagemVisibleNow(stratagem, phase, side.isActive, allPhases))
        if (!shown.length) return null
        return (
          <div key={group.label} className="space-y-1.5">
            <p className={HEADING}>{group.label}</p>
            {shown.map((stratagem) => (
              <StratagemCard
                key={stratagem.key}
                stratagem={stratagem}
                written={writtenFor(stratagem.key)}
                actionable={actionable}
                pending={pending}
                available={side.cp}
                side={side}
                onUse={(cp) =>
                  send({ kind: 'use-stratagem', key: stratagem.key, playerId: side.captain.id, ...(cp === undefined ? {} : { cp }) })
                }
                onUseNewOrders={(secondaryKey, secondary, cp) =>
                  send({
                    kind: 'use-new-orders',
                    stratagemKey: stratagem.key,
                    secondaryKey,
                    secondary,
                    playerId: side.captain.id,
                    ...(cp === stratagem.cp ? {} : { cp }),
                  })
                }
              />
            ))}
          </div>
        )
      })}
      {otherPhases && !allPhases ? (
        <Button variant="ghost" size="xs" className="text-azure" onClick={() => setAllPhases(true)}>
          Show {otherPhases} for other phases
        </Button>
      ) : null}
      {allPhases ? (
        <Button variant="ghost" size="xs" className="text-azure" onClick={() => setAllPhases(false)}>
          Only this phase
        </Button>
      ) : null}
    </section>
  )
}

/** The name opens what the stratagem is for; the button spends the CP. */
function StratagemCard({
  stratagem,
  written,
  actionable,
  pending,
  available,
  side,
  onUse,
  onUseNewOrders,
}: {
  stratagem: ViewStratagem
  written: StratagemText | undefined
  actionable: boolean
  pending: boolean
  available: number
  side: Side
  onUse: (cp?: number) => void
  onUseNewOrders: (secondaryKey: string, secondary: Side['remainingSecondaries'][number], cp: number) => void
}) {
  const [newOrdersCost, setNewOrdersCost] = useState<number | null>(null)
  const newOrders = isNewOrders(stratagem)
  const replaceable = newOrders ? side.secondaries.filter((secondary) => !secondary.secret && secondary.status === 'active') : []
  const replacement = side.remainingSecondaries[0]
  const newOrdersRefusal = newOrders
    ? side.secondaryMode !== 'tactical'
      ? 'New Orders requires tactical secondary missions.'
      : !replaceable.length
        ? 'Choose an active secondary mission first.'
        : !replacement
          ? 'No secondary missions remain to draw.'
          : null
    : null
  const refusal = stratagem.refusal ?? newOrdersRefusal
  const use = (cp = stratagem.cp) => {
    if (newOrders) setNewOrdersCost(cp)
    else onUse(cp === stratagem.cp ? undefined : cp)
  }
  const timing = [
    written?.type,
    stratagem.phases?.length ? `${stratagem.phases.map(title).join(', ')} phase` : 'Any phase',
    stratagem.turn === 'your-turn' ? 'Your turn' : stratagem.turn === 'opponent-turn' ? 'Opponent’s turn' : 'Either turn',
    stratagem.limit === 'unlimited' ? 'No use limit' : `Once per ${stratagem.limit}`,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className={`${CARD} flex items-center gap-1.5`}>
      <Dialog>
        <DialogTrigger
          render={
            <button
              type="button"
              aria-label={`About ${stratagem.name}`}
              className={`min-w-0 flex-1 text-left ${CARD_NAME} hover:underline`}
            />
          }
        >
          {stratagem.name}
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto border border-edge bg-panel text-bone sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="uppercase">{stratagem.name}</DialogTitle>
            <DialogDescription className="eyebrow">{timing}</DialogDescription>
          </DialogHeader>
          <p className="flex items-baseline justify-between gap-3">
            <span className="chip">{stratagem.cp} CP</span>
            <span className="readout text-xs text-dim">used {stratagem.uses}x this battle</span>
          </p>
          {written?.description ? (
            <RuleText text={written.description} rules={written.keywordRules} />
          ) : (
            <p className="mt-2 text-sm text-dim">No description is available for this stratagem.</p>
          )}
          {refusal ? <p className="mt-2 text-sm text-discarded">{refusal}</p> : null}
        </DialogContent>
      </Dialog>
      {actionable ? (
        <>
          {/* Some stratagems cost more or less depending on what is on the board, so the price is a choice. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Spend a different amount on ${stratagem.name}`}
              className="grid size-6 shrink-0 place-items-center text-dim hover:text-bone"
            >
              <EllipsisVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {costChoices(stratagem.cp).map((cost) => (
                <DropdownMenuItem key={cost} disabled={pending || cost > available || Boolean(newOrdersRefusal)} onClick={() => use(cost)}>
                  Use for {cost} CP
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            className={`readout shrink-0 rounded-sm px-2 py-1.5 text-sm font-bold uppercase ${
              refusal ? 'bg-edge text-dim' : 'bg-azure text-void hover:bg-azure/80'
            }`}
            disabled={pending || refusal !== null}
            title={refusal ?? undefined}
            aria-label={`Use ${stratagem.name}`}
            onClick={() => use()}
          >
            {stratagem.cp} CP
          </button>
        </>
      ) : (
        <span
          className={`readout shrink-0 rounded-sm px-1.5 py-px text-[0.6875rem] font-bold uppercase ${
            refusal ? 'bg-edge text-dim' : 'bg-azure text-void'
          }`}
        >
          {stratagem.cp} CP
        </span>
      )}
      <Dialog open={newOrdersCost !== null} onOpenChange={(open) => !open && setNewOrdersCost(null)}>
        <DialogContent className="rounded-none border border-parchment/60 bg-panel text-bone ring-0 sm:max-w-md">
          <DialogHeader className="pr-7">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-parchment uppercase">New Orders</DialogTitle>
              <span className="chip shrink-0">{newOrdersCost ?? stratagem.cp} CP</span>
            </div>
            <DialogDescription className="text-dim">
              Pick an active secondary mission to discard. Its replacement will be drawn at random.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="eyebrow">Choose a mission to replace</p>
            {replaceable.map((secondary) => (
              <Button
                key={secondary.key}
                variant="outline"
                aria-label={`Discard ${secondary.name} and draw a replacement`}
                className="group h-auto w-full justify-between rounded-none border-edge bg-sunken px-3 py-3 text-left hover:border-parchment hover:bg-raised"
                disabled={pending || !replacement || newOrdersCost === null}
                onClick={() => {
                  if (!replacement || newOrdersCost === null) return
                  onUseNewOrders(secondary.key, replacement, newOrdersCost)
                  setNewOrdersCost(null)
                }}
              >
                <span className="min-w-0 whitespace-normal">
                  <span className="block text-[0.6875rem] leading-none font-bold tracking-[0.1em] text-discarded uppercase">Discard</span>
                  <span className="mt-1 block text-sm leading-tight font-bold text-bone uppercase">{secondary.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-parchment uppercase">
                  <RefreshCw aria-hidden className="size-3.5 transition-transform group-hover:rotate-45" />
                  Replace
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The source stores phases in lower case; every other name on screen is titled. */
const title = (value: string) => value.charAt(0).toLocaleUpperCase() + value.slice(1)

/** The printed price, and the neighbouring ones a board state can move it to. */
function costChoices(printed: number) {
  return [printed - 1, printed, printed + 1, printed + 2].filter((cost) => cost >= 0 && cost <= STRATAGEM_CP_MAX)
}

/**
 * The pool, split the way its cards are actually owned.
 *
 * One detachment is one heading. A side of allies pools two, and their rules do not
 * pool with them — each ally's detachment affects their own army and the enemy, not
 * their ally's — so a pooled side is given a heading per detachment rather than one
 * list that reads as everyone's. A pool recorded before detachments were named keeps
 * the single heading it was written with.
 */
function groups(stratagems: readonly ViewStratagem[], coreKeys: ReadonlySet<string>) {
  const detachment = stratagems.filter((stratagem) => !coreKeys.has(stratagem.key))
  const names = [...new Set(detachment.flatMap((stratagem) => (stratagem.detachment ? [stratagem.detachment] : [])))]
  const byDetachment =
    names.length > 1
      ? [
          ...names.map((name) => ({ label: `${name} stratagems`, items: detachment.filter((stratagem) => stratagem.detachment === name) })),
          { label: 'Detachment stratagems', items: detachment.filter((stratagem) => !stratagem.detachment) },
        ]
      : [{ label: 'Detachment stratagems', items: detachment }]
  return [...byDetachment, { label: 'Core stratagems', items: stratagems.filter((stratagem) => coreKeys.has(stratagem.key)) }].filter(
    (group) => group.items.length,
  )
}

/** Whether the side's pool holds more than one ally's detachment. */
export function pooledDetachments(stratagems: readonly ViewStratagem[], coreKeys: ReadonlySet<string>) {
  return new Set(stratagems.flatMap((stratagem) => (!coreKeys.has(stratagem.key) && stratagem.detachment ? [stratagem.detachment] : [])))
    .size
}
