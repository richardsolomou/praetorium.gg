import { useLayoutEffect, useState, type ComponentProps } from 'react'
import { Dialog } from '@/components/ui/dialog'

type Props = ComponentProps<typeof Dialog>

export function BattlePromptDialog({ children, modal, disablePointerDismissal, ...props }: Props) {
  const [applicationNavigation, setApplicationNavigation] = useState(false)

  useLayoutEffect(() => {
    const compact = window.matchMedia('(max-width: 859px)')
    const sync = () => setApplicationNavigation(compact.matches || document.documentElement.dataset.nativeApp === 'true')
    sync()
    compact.addEventListener('change', sync)
    return () => compact.removeEventListener('change', sync)
  }, [])

  return (
    <div data-battle-prompt className="contents">
      <Dialog
        {...props}
        modal={applicationNavigation ? false : modal}
        disablePointerDismissal={applicationNavigation || disablePointerDismissal}
      >
        {children}
      </Dialog>
    </div>
  )
}
