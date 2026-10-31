import { useState, type ReactNode } from 'react'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '../../components/Dialog'
import { BattleDialogContent, BattlePromptDialog } from '../battle/BattlePromptDialog'
import { CombatSimulatorMatchup } from './CombatSimulator'
import type { CombatRoster } from './useCombatant'
import { RosterCombatComparison } from './RosterCombatComparison'

export function RosterCombatDialog({
  roster,
  onClose,
  startWithRosters = false,
}: {
  roster: CombatRoster
  onClose: () => void
  startWithRosters?: boolean
}) {
  const [comparingRosters, setComparingRosters] = useState(startWithRosters)
  return (
    <CombatDialog onClose={onClose} title={startWithRosters ? 'Test targets' : 'Combat simulator'} wide={comparingRosters}>
      {startWithRosters ? (
        <RosterCombatComparison currentRoster={roster} />
      ) : (
        <RosterCombatComparison
          currentRoster={roster}
          units={{
            active: !comparingRosters,
            onActiveChange: (active) => setComparingRosters(!active),
            matchup: <CombatSimulatorMatchup source="roster" roster={roster} inDialog />,
          }}
        />
      )}
    </CombatDialog>
  )
}

export function CombatDialog({
  children,
  onClose,
  battle = false,
  title = 'Combat simulator',
  wide = false,
}: {
  children: ReactNode
  onClose: () => void
  battle?: boolean
  title?: string
  wide?: boolean
}) {
  const Root = battle ? BattlePromptDialog : Dialog
  const Content = battle ? BattleDialogContent : DialogContent
  return (
    <Root open onOpenChange={(open) => !open && onClose()} minimizedLabel="Combat simulator" resumeLabel="Return to simulator">
      {/* Focusing the first control would open its tooltip over the sides as the dialog appears. */}
      <Content size={wide ? 'lg' : 'md'} fill initialFocus={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody data-simulator-scroll className="block p-0">
          {children}
        </DialogBody>
      </Content>
    </Root>
  )
}
