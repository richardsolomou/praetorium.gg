import { Minus } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useId, useState, type ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '../../components/Dialog'
import { useCompactChrome } from '../shell/useCompactChrome'

type Props = Omit<ComponentProps<typeof Dialog>, 'defaultOpen' | 'modal' | 'disablePointerDismissal'> & {
  minimizedLabel?: string
  resumeLabel?: string
}

export const BattleMinimizeContext = createContext<((id: string, minimized: boolean) => number) | null>(null)
const InspectContext = createContext<(() => void) | null>(null)

export function BattlePromptDialog({ children, open, onOpenChange, minimizedLabel, resumeLabel = 'Return to prompt', ...props }: Props) {
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

  return (
    // Marked only while open, so a closed prompt mounted beside other dialogs does not reshape them.
    <div
      data-battle-prompt={(open ?? internalOpen) || undefined}
      data-battle-prompt-inspecting={inspecting || undefined}
      className="contents"
    >
      <InspectContext.Provider value={register ? inspect : null}>
        <Dialog
          {...props}
          open={(open ?? internalOpen) && !inspecting}
          modal={!applicationNavigation}
          disablePointerDismissal={applicationNavigation}
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
  minimizeDisabled = false,
  ...props
}: ComponentProps<typeof DialogContent> & { minimizeDisabled?: boolean }) {
  const inspect = useContext(InspectContext)
  return (
    <DialogContent
      {...props}
      data-battle-dialog-content
      actions={
        inspect ? (
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
      }
    >
      {children}
    </DialogContent>
  )
}
