import { createElement, useEffect, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { closeTextSourcesDialog, useTextSourcesDialog } from '../../components/textSourcesDialogState'
import { useLoadedComponent } from '../../useLoadedComponent'
import { onOpenSupport, type SupportView } from '../feedback/support'

const loadLiveProduct = () => import('../../spacetimeLive').then((module) => module.LiveProduct)
const loadDisplayNamePrompt = () => import('../account/DisplayNamePrompt').then((module) => module.DisplayNamePrompt)
const loadSupportPanel = () => import('../feedback/SupportPanel').then((module) => module.SupportPanel)
const loadTextSourcesForm = () => import('../../components/TextSourcesDialog').then((module) => module.TextSourcesForm)
const loadAchievementToasts = () => import('../profile/AchievementToasts').then((module) => module.AchievementToasts)

export function ShellLiveProduct({ signedIn }: { signedIn: boolean }) {
  const LiveProduct = useLoadedComponent(loadLiveProduct)
  return LiveProduct && createElement(LiveProduct, { signedIn })
}

export function ShellDisplayNamePrompt() {
  const DisplayNamePrompt = useLoadedComponent(loadDisplayNamePrompt)
  return DisplayNamePrompt && createElement(DisplayNamePrompt)
}

export function ShellSupportPanel() {
  const [request, setRequest] = useState<{ view: SupportView } | null>(null)
  useEffect(() => onOpenSupport((view) => setRequest({ view })), [])
  const SupportPanel = useLoadedComponent(loadSupportPanel, request !== null)
  return request && SupportPanel && createElement(SupportPanel, { request })
}

export function ShellTextSourcesDialog() {
  const request = useTextSourcesDialog()
  const TextSourcesForm = useLoadedComponent(loadTextSourcesForm, request !== null)
  return (
    <Dialog open={Boolean(request && TextSourcesForm)} onOpenChange={(open) => !open && closeTextSourcesDialog()}>
      {request && TextSourcesForm && createElement(TextSourcesForm, { needed: request.source, close: closeTextSourcesDialog })}
    </Dialog>
  )
}

export function ShellAchievementToasts({ userId }: { userId: string }) {
  const AchievementToasts = useLoadedComponent(loadAchievementToasts)
  return AchievementToasts && createElement(AchievementToasts, { userId })
}
