import { createElement, useEffect, useState } from 'react'
import { useLoadedComponent } from '../../useLoadedComponent'
import { REPORT_PROBLEM_EVENT } from '../../components/RouteError'
import { onOpenSupport, reportProblem, type SupportView } from '../feedback/support'

const loadLiveProduct = () => import('../../spacetimeLive').then((module) => module.LiveProduct)
const loadDisplayNamePrompt = () => import('../account/DisplayNamePrompt').then((module) => module.DisplayNamePrompt)
const loadSupportPanel = () => import('../feedback/SupportPanel').then((module) => module.SupportPanel)
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
  useEffect(() => {
    const report = (event: Event) => reportProblem(String((event as CustomEvent<unknown>).detail))
    window.addEventListener(REPORT_PROBLEM_EVENT, report)
    return () => window.removeEventListener(REPORT_PROBLEM_EVENT, report)
  }, [])
  const SupportPanel = useLoadedComponent(loadSupportPanel, request !== null)
  return request && SupportPanel && createElement(SupportPanel, { request })
}

export function ShellAchievementToasts({ userId }: { userId: string }) {
  const AchievementToasts = useLoadedComponent(loadAchievementToasts)
  return AchievementToasts && createElement(AchievementToasts, { userId })
}
