import type { ReactNode } from 'react'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '../../components/Dialog'
import { BattleDialogContent, BattlePromptDialog } from '../battle/BattlePromptDialog'
import { CombatSimulatorMatchup } from './CombatSimulator'
import type { CombatRoster } from './useCombatant'

export function RosterCombatDialog({ roster, onClose }: { roster: CombatRoster; onClose: () => void }) {
  return (
    <CombatDialog onClose={onClose}>
      <CombatSimulatorMatchup source="roster" roster={roster} inDialog />
    </CombatDialog>
  )
}

export function CombatDialog({ children, onClose, battle = false }: { children: ReactNode; onClose: () => void; battle?: boolean }) {
  const Root = battle ? BattlePromptDialog : Dialog
  const Content = battle ? BattleDialogContent : DialogContent
  return (
    <Root open onOpenChange={(open) => !open && onClose()} minimizedLabel="Combat simulator" resumeLabel="Return to simulator">
      <Content size="md" fill>
        <DialogHeader>
          <DialogTitle>Combat simulator</DialogTitle>
        </DialogHeader>
        <DialogBody data-simulator-scroll className="block p-0">
          {children}
        </DialogBody>
      </Content>
    </Root>
  )
}
