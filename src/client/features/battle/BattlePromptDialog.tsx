import { Minus } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useId, useState, type ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, Drawer, SheetContent } from '../../components/Dialog'
import { useCompactChrome } from '../shell/useCompactChrome'

type Props = Omit<ComponentProps<typeof Dialog>, 'defaultOpen' | 'modal' | 'disablePointerDismissal' | 'onOpenChange'> & {
  onOpenChange?: (open: boolean) => void
  minimizedLabel: string
  resumeLabel?: string
  /**
   * On a phone, a drawer at the thumb rather than a screen of its own. Swiping it down minimizes it, as a prompt
   * still owed an answer has to come back, unless `onSwipeDown` gives the swipe a meaning of its own.
   */
  sheet?: boolean
  onSwipeDown?: () => void
}

export const BattleMinimizeContext = createContext<((id: string, minimized: boolean) => number) | null>(null)
const InspectContext = createContext<(() => void) | null>(null)
const SheetContext = createContext(false)

export function BattlePromptDialog({
  children,
  open,
  onOpenChange,
  minimizedLabel,
  resumeLabel = 'Return to prompt',
  sheet = false,
  onSwipeDown,
  ...props
}: Props) {
  const applicationNavigation = useCompactChrome()
  const [internalOpen, setInternalOpen] = useState(false)
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

  const shown = (open ?? internalOpen) && !inspecting
  const change = (next: boolean) => {
    if (open === undefined) setInternalOpen(next)
    onOpenChange?.(next)
  }
  const drawer = sheet && applicationNavigation

  return (
    // Marked only while open, so a closed prompt mounted beside other dialogs does not reshape them.
    <div
      data-battle-prompt={(open ?? internalOpen) || undefined}
      data-battle-prompt-inspecting={inspecting || undefined}
      className="contents"
    >
      <InspectContext.Provider value={register ? inspect : null}>
        <SheetContext.Provider value={drawer}>
          {drawer ? (
            <Drawer
              open={shown}
              modal={false}
              disablePointerDismissal
              showSwipeHandle
              onOpenChange={(next, details) => {
                if (next || details.reason !== 'swipe') change(next)
                else if (onSwipeDown) onSwipeDown()
                else if (register) inspect()
              }}
            >
              {children}
            </Drawer>
          ) : (
            <Dialog
              {...props}
              open={shown}
              modal={!applicationNavigation}
              disablePointerDismissal={applicationNavigation}
              onOpenChange={(next) => change(next)}
            >
              {children}
            </Dialog>
          )}
        </SheetContext.Provider>
      </InspectContext.Provider>
      {inspecting ? (
        <div
          data-minimized-battle-prompt
          style={{ marginBottom: `${stackIndex * 4.5}rem` }}
          className="fixed right-3 left-[calc(var(--app-chrome-left)+0.75rem)] z-50 flex items-center justify-between gap-3 rounded-lg border border-runner bg-panel p-2 shadow-xl lg:inset-x-auto lg:right-4 lg:bottom-4"
        >
          <div className="min-w-0 pl-1">
            <p className="truncate text-sm font-semibold">{minimizedLabel}</p>
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
  minimizeDisabled = false,
  className,
  showCloseButton,
  ...props
}: ComponentProps<typeof DialogContent> & { minimizeDisabled?: boolean }) {
  const inspect = useContext(InspectContext)
  const sheet = useContext(SheetContext)
  const actions = inspect ? (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label="Minimize dialog"
      title="Minimize dialog"
      disabled={minimizeDisabled}
      onClick={inspect}
    >
      <Minus />
    </Button>
  ) : null
  return sheet ? (
    <SheetContent
      data-battle-dialog-content
      actions={actions}
      showCloseButton={showCloseButton}
      // Above the application tabs, which a prompt leaves reachable.
      className={cn(
        'pb-0 data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-4rem-var(--app-header)-env(safe-area-inset-top)-env(safe-area-inset-bottom))] data-[swipe-direction=down]:bottom-[calc(4rem+env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {children}
    </SheetContent>
  ) : (
    <DialogContent {...props} className={className} showCloseButton={showCloseButton} data-battle-dialog-content actions={actions}>
      {children}
    </DialogContent>
  )
}
