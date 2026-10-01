import { Minus } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useState, type ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

type Props = ComponentProps<typeof Dialog> & {
  minimizedLabel?: string
  resumeLabel?: string
}

export const BattleMinimizeContext = createContext<((id: string, minimized: boolean) => number) | null>(null)
const InspectContext = createContext<(() => void) | null>(null)

export function BattlePromptDialog({
  children,
  modal,
  disablePointerDismissal,
  open,
  defaultOpen,
  onOpenChange,
  minimizedLabel,
  resumeLabel = 'Return to prompt',
  ...props
}: Props) {
  const [applicationNavigation, setApplicationNavigation] = useState(false)
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false)
  const [inspecting, setInspecting] = useState(false)
  const [stackIndex, setStackIndex] = useState(0)
  const register = useContext(BattleMinimizeContext)
  const id = useId()
  const inspect = useCallback(() => {
    setStackIndex(register?.(id, true) ?? 0)
    setInspecting(true)
  }, [id, register])
  const resume = () => {
    register?.(id, false)
    setInspecting(false)
  }

  useEffect(
    () => () => {
      register?.(id, false)
    },
    [id, register],
  )

  useLayoutEffect(() => {
    const compact = window.matchMedia('(max-width: 859px)')
    const sync = () => setApplicationNavigation(compact.matches || document.documentElement.dataset.nativeApp === 'true')
    sync()
    compact.addEventListener('change', sync)
    return () => compact.removeEventListener('change', sync)
  }, [])

  return (
    <div data-battle-prompt data-battle-prompt-inspecting={inspecting || undefined} className="contents">
      <InspectContext.Provider value={register ? inspect : null}>
        <Dialog
          {...props}
          open={(open ?? internalOpen) && !inspecting}
          modal={applicationNavigation ? false : modal}
          disablePointerDismissal={applicationNavigation || disablePointerDismissal}
          onOpenChange={(next, details) => {
            if (open === undefined) setInternalOpen(next)
            onOpenChange?.(next, details)
          }}
        >
          {children}
        </Dialog>
      </InspectContext.Provider>
      {inspecting ? (
        <div
          data-minimized-battle-prompt
          style={{ marginBottom: `${stackIndex * 4.5}rem` }}
          className="fixed inset-x-3 z-50 flex items-center justify-between gap-3 rounded-lg border border-edge-strong bg-panel p-2 shadow-xl lg:inset-x-auto lg:right-4 lg:bottom-4"
        >
          <div className="min-w-0 pl-1">
            <p className="truncate text-sm font-semibold">{minimizedLabel ?? 'Battle dialog'}</p>
            <p className="text-xs text-dim">
              {resumeLabel === 'Return to prompt' ? 'Finish this prompt to continue' : 'Return here to continue'}
            </p>
          </div>
          <Button className="shrink-0" onClick={resume}>
            {resumeLabel}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function BattleDialogContent({
  children,
  showCloseButton,
  minimizeDisabled = false,
  ...props
}: ComponentProps<typeof DialogContent> & { minimizeDisabled?: boolean }) {
  const inspect = useContext(InspectContext)
  return (
    <DialogContent {...props} showCloseButton={showCloseButton} data-battle-dialog-content>
      {children}
      {inspect ? (
        <Button
          variant="outline"
          size="icon-sm"
          className={`absolute top-2 ${showCloseButton === false ? 'right-2' : 'right-12'}`}
          aria-label="Minimize dialog"
          title="Minimize dialog"
          disabled={minimizeDisabled}
          onClick={inspect}
        >
          <Minus />
        </Button>
      ) : null}
    </DialogContent>
  )
}
