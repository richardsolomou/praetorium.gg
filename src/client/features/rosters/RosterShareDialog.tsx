import { posthog } from 'posthog-js'
import { Check, Copy, Download, LoaderCircle, Printer, QrCode, Share2, type LucideIcon } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import { ROSTER_VISIBILITIES, type RosterVisibility } from '../../../core/savedRoster'
import { useNativeShare } from '../../nativeBridge'
import { shareButtonLabel } from '../../useShareLink'
import { VISIBILITY_ICON, VISIBILITY_NAME, VISIBILITY_REACH } from './visibility'

export type RosterShareChoices = {
  title: string
  visibility: RosterVisibility
  /** Absent when this reader cannot change who opens the list, such as on someone else's roster. */
  onVisibility?: (visibility: RosterVisibility) => void
  /** The level being saved, which shows as pending until it lands. */
  choosing?: RosterVisibility | null
  visibilityNote?: string
  visibilityError?: unknown
  /** Null where the list has no link to hand out, such as a draft or an army fielded in a battle. */
  link: string | null
  onCopy: () => void
  copied: 'copied' | 'shared' | null
  copying: boolean
  copyProblem?: ReactNode
  onExport: () => void
  exporting?: boolean
  onExchange: () => void
  exchanging?: boolean
  onPrint: () => void
  printDisabled?: boolean
}

/**
 * Everything that gets a list in front of someone else, in one place: who can open it, its link, and the copies that
 * travel without one. Visibility applies the moment it is picked, so the link below always says what it will do.
 * The library and the roster page each supply their own actions.
 */
export function RosterShareDialog({ open, onClose, ...share }: RosterShareChoices & { open: boolean; onClose: () => void }) {
  const nativeShare = useNativeShare()
  useEffect(() => {
    if (open) posthog.capture('roster_share_opened')
  }, [open])
  const isPrivate = share.visibility === 'private'
  const pending = Boolean(share.choosing)
  const CurrentIcon = VISIBILITY_ICON[share.visibility]
  // The export and exchange dialogs take over from here rather than stacking on top of this one.
  const handOff = (action: () => void) => () => {
    onClose()
    action()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 aria-hidden className="size-4 shrink-0 text-parchment" /> Share {share.title}
          </DialogTitle>
          <DialogDescription>
            {share.onVisibility
              ? 'Choose who can open it, then send the link or take a copy with you.'
              : 'Send the link or take a copy with you.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-5">
          <fieldset className="grid gap-2">
            <legend className="eyebrow mb-2">Who can open it</legend>
            {share.onVisibility ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {ROSTER_VISIBILITIES.map((visibility) => {
                  const Icon = VISIBILITY_ICON[visibility]
                  return (
                    <label
                      key={visibility}
                      className="group grid cursor-pointer content-start gap-1.5 rounded-xl border border-edge bg-sunken p-3 transition-[border-color,background-color,box-shadow] duration-150 hover:border-runner-hi hover:bg-raised has-checked:border-parchment/70 has-checked:bg-raised has-checked:shadow-part has-disabled:cursor-wait has-focus-visible:outline-2 has-focus-visible:outline-info"
                    >
                      <input
                        type="radio"
                        name="roster-visibility"
                        value={visibility}
                        className="sr-only"
                        checked={share.visibility === visibility}
                        disabled={pending}
                        onChange={() => share.onVisibility!(visibility)}
                      />
                      <span className="flex items-center gap-2 text-sm font-semibold text-bone">
                        {share.choosing === visibility ? (
                          <LoaderCircle aria-hidden className="size-4 animate-spin text-parchment" />
                        ) : (
                          <Icon aria-hidden className="size-4 text-faint group-has-checked:text-parchment" />
                        )}
                        {VISIBILITY_NAME[visibility]}
                        <Check aria-hidden className="ml-auto size-4 text-parchment opacity-0 group-has-checked:opacity-100" />
                      </span>
                      <span className="text-xs leading-snug text-dim">{VISIBILITY_REACH[visibility]}</span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-bone">
                <CurrentIcon aria-hidden className="size-4 shrink-0 text-parchment" />
                <span>
                  <span className="font-semibold">{VISIBILITY_NAME[share.visibility]}</span>
                  <span className="text-dim"> · {VISIBILITY_REACH[share.visibility]}</span>
                </span>
              </p>
            )}
            {share.visibilityNote ? <p className="text-xs text-dim">{share.visibilityNote}</p> : null}
            {share.visibilityError ? <Problem error={share.visibilityError} /> : null}
          </fieldset>

          {share.link !== null && (share.onVisibility || !isPrivate) ? (
            <section aria-labelledby="share-link" className="grid gap-2">
              <h3 id="share-link" className="eyebrow">
                Link
              </h3>
              <div className="flex items-stretch gap-2">
                <input
                  readOnly
                  aria-label="Roster link"
                  value={share.link}
                  onFocus={(event) => event.currentTarget.select()}
                  className="h-9 min-w-0 flex-1 truncate rounded-lg border border-edge bg-sunken px-3 font-mono text-xs text-dim data-[private]:text-faint"
                  data-private={isPrivate || undefined}
                />
                <Button className="h-9 shrink-0" disabled={!share.link || share.copying || pending} onClick={share.onCopy}>
                  {share.copied ? <Check /> : <Copy />}
                  {isPrivate
                    ? nativeShare
                      ? 'Make unlisted and share'
                      : 'Make unlisted and copy'
                    : shareButtonLabel(share.copied, nativeShare, 'link')}
                </Button>
              </div>
              <p className="text-xs text-dim">
                {isPrivate
                  ? 'Nobody else can open this link while the roster is private. Copying it makes the roster unlisted.'
                  : 'Anyone with this link can read the roster, but only its owner can change it.'}
              </p>
              {share.copyProblem ? <Problem>{share.copyProblem}</Problem> : null}
            </section>
          ) : null}

          <section aria-labelledby="share-copy" className="grid gap-2">
            <h3 id="share-copy" className="eyebrow">
              Take a copy
            </h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <CopyTile
                icon={Download}
                label="Export text"
                detail="Readable text to paste anywhere"
                disabled={share.exporting}
                onClick={handOff(share.onExport)}
              />
              <CopyTile
                icon={QrCode}
                label="Exchange code"
                detail="A code or QR another player imports"
                disabled={share.exchanging}
                onClick={handOff(share.onExchange)}
              />
              <CopyTile
                icon={Printer}
                label="Print"
                detail="A battle reference pack"
                disabled={share.printDisabled}
                onClick={handOff(() => {
                  posthog.capture('roster_print_started')
                  share.onPrint()
                })}
              />
            </div>
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function CopyTile({
  icon: Icon,
  label,
  detail,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  label: string
  detail: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group grid content-start gap-1 rounded-xl border border-edge bg-panel p-3 text-left transition-colors duration-150 hover:border-info/60 hover:bg-raised disabled:opacity-60"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-bone">
        <Icon aria-hidden className="size-4 text-faint transition-colors group-hover:text-info" />
        {label}
      </span>
      <span className="text-xs leading-snug text-dim">{detail}</span>
    </button>
  )
}
