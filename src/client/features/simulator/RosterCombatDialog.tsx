import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CombatSimulatorMatchup } from './CombatSimulator'
import type { CombatRoster } from './useCombatant'

export function RosterCombatDialog({ roster, onClose }: { roster: CombatRoster; onClose: () => void }) {
  return (
    <CombatDialog onClose={onClose}>
      <CombatSimulatorMatchup roster={roster} inDialog />
    </CombatDialog>
  )
}

export function CombatDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[90dvh] min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-edge p-4 pr-12">
          <DialogTitle>Combat simulator</DialogTitle>
        </DialogHeader>
        <div data-simulator-scroll className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}
