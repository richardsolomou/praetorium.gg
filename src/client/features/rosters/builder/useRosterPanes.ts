import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyedPick } from '../rosterPicks'

export type RosterPaneHistory =
  | { workspace: string; pane: 'picker' }
  | ({ workspace: string; pane: 'loadout'; returnToPicker?: boolean } & (
      | { selectedKey: number }
      | { preview: { catalogueId: string; entryId: string; name: string } }
    ))

type RosterLocationState = { rosterPane?: RosterPaneHistory }

const ROSTER_PANE_HASH = 'roster-pane'

export function useRosterPanes({ path, workspacePath, picks }: { path: string; workspacePath: string; picks: readonly KeyedPick[] }) {
  const navigate = useNavigate()
  const router = useRouter()
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ catalogueId: string; entryId: string; name: string } | null>(null)
  const [showing, setShowing] = useState<'picker' | 'loadout' | null>(null)
  const [wideWorkspace, setWideWorkspace] = useState(true)
  const [loadoutInline, setLoadoutInline] = useState(true)
  const [workspaceMeasured, setWorkspaceMeasured] = useState(false)
  const paneHistory = useRouterState({
    select: (state) => {
      if (state.location.hash !== ROSTER_PANE_HASH) return null
      const pane = (state.location.state as RosterLocationState).rosterPane
      return pane?.workspace === workspacePath ? pane : null
    },
  })
  const paneHistoryRef = useRef<RosterPaneHistory | null>(null)
  const paneAfterHistoryBack = useRef<RosterPaneHistory | null>(null)
  const paneHistoryBackPending = useRef(false)
  const paneClosing = useRef(false)
  /** The history entry this workspace opened on, which nothing here may step behind. */
  const openedAt = useRef(router.history.location.state.__TSR_index)
  /*
   * Leave the pane entry, keeping `next` open behind it.
   *
   * Stepping back is only safe over an entry stacked on top of the one this workspace
   * opened on. A restored tab, a reload or a shared link mounts straight onto an open
   * pane, and what sits behind that belongs to whatever opened the roster — the same
   * step would leave the roster altogether. That entry is replaced in place instead.
   */
  const backFromPane = useCallback(
    (next: RosterPaneHistory | null = null) => {
      if (paneHistoryBackPending.current) return
      paneHistoryBackPending.current = true
      paneAfterHistoryBack.current = next
      if (router.history.location.state.__TSR_index > openedAt.current) router.history.back()
      else void navigate({ href: path, replace: true, resetScroll: false, state: (current) => ({ ...current, rosterPane: undefined }) })
    },
    [navigate, path, router],
  )

  useLayoutEffect(() => {
    const wide = window.matchMedia('(min-width: 1300px)')
    const inline = window.matchMedia('(min-width: 1024px)')
    const sync = () => {
      setWideWorkspace(wide.matches)
      setLoadoutInline(inline.matches)
      setWorkspaceMeasured(true)
    }
    sync()
    wide.addEventListener('change', sync)
    inline.addEventListener('change', sync)
    return () => {
      wide.removeEventListener('change', sync)
      inline.removeEventListener('change', sync)
    }
  }, [])
  useEffect(() => {
    if (!paneHistory) {
      paneHistoryBackPending.current = false
      const closed = paneHistoryRef.current
      if (!closed) return
      paneHistoryRef.current = null
      const next = paneAfterHistoryBack.current
      paneAfterHistoryBack.current = null
      if (next) {
        paneClosing.current = false
        setShowing(next.pane)
        return
      }
      paneClosing.current = true
      setShowing(null)
      if (closed.pane === 'loadout' && loadoutInline) {
        setSelected(null)
        setPreview(null)
      }
      return
    }

    paneHistoryRef.current = paneHistory
    setShowing(paneHistory.pane)
    if (paneHistory.pane === 'picker') return
    if ('preview' in paneHistory) {
      setPreview(paneHistory.preview)
      setSelected(null)
      return
    }
    const selectedIndex = picks.findIndex((pick) => pick.key === paneHistory.selectedKey)
    if (selectedIndex !== -1) {
      setPreview(null)
      setSelected(selectedIndex)
      return
    }
    paneHistoryRef.current = null
    setShowing(null)
    setPreview(null)
    setSelected(null)
    backFromPane()
  }, [backFromPane, loadoutInline, paneHistory, picks])
  const pushPaneHistory = useCallback(
    (pane: RosterPaneHistory, stack = false) => {
      paneHistoryRef.current = pane
      void navigate({
        href: `${path}#${ROSTER_PANE_HASH}`,
        hashScrollIntoView: false,
        replace: Boolean(paneHistory) && !stack,
        resetScroll: false,
        state: (current) => ({ ...current, rosterPane: pane }) as typeof current,
      })
    },
    [navigate, paneHistory, path],
  )

  const closePane = useCallback(() => {
    if (paneHistory) backFromPane()
    else {
      paneHistoryRef.current = null
      setShowing(null)
    }
  }, [backFromPane, paneHistory])

  const openPicker = useCallback(() => {
    setShowing('picker')
    if (!wideWorkspace) pushPaneHistory({ workspace: workspacePath, pane: 'picker' })
  }, [pushPaneHistory, wideWorkspace, workspacePath])

  const updateLoadoutHistory = useCallback(
    (pane: Extract<RosterPaneHistory, { pane: 'loadout' }>) => {
      const returnToPicker = paneHistory?.pane === 'picker' || (paneHistory?.pane === 'loadout' && Boolean(paneHistory.returnToPicker))
      const next = returnToPicker ? { ...pane, returnToPicker: true } : pane
      if (!loadoutInline) pushPaneHistory(next, paneHistory?.pane === 'picker')
      else if (paneHistory?.pane === 'picker') {
        backFromPane(next)
      }
    },
    [backFromPane, loadoutInline, paneHistory, pushPaneHistory],
  )

  // A pane the workspace is wide enough to draw in place no longer needs a history
  // entry of its own. The widths are the desktop defaults until the layout effect
  // above measures them, so a mount that lands on an open pane has to wait for that.
  useEffect(() => {
    if (!paneHistory || !workspaceMeasured) return
    const becameInline = paneHistory.pane === 'picker' ? wideWorkspace : loadoutInline
    if (!becameInline) return
    backFromPane(paneHistory)
  }, [backFromPane, loadoutInline, paneHistory, wideWorkspace, workspaceMeasured])

  useEffect(() => {
    if (showing === null) {
      paneClosing.current = false
      return
    }
    if (!workspaceMeasured || paneHistoryRef.current || paneClosing.current) return
    if (showing === 'picker' && !wideWorkspace) pushPaneHistory({ workspace: workspacePath, pane: 'picker' })
    if (showing !== 'loadout' || loadoutInline) return
    if (preview) pushPaneHistory({ workspace: workspacePath, pane: 'loadout', preview })
    else if (selected !== null && picks[selected]) {
      pushPaneHistory({ workspace: workspacePath, pane: 'loadout', selectedKey: picks[selected].key })
    }
  }, [loadoutInline, paneHistory, picks, preview, pushPaneHistory, selected, showing, wideWorkspace, workspaceMeasured, workspacePath])

  return {
    selected,
    setSelected,
    preview,
    setPreview,
    showing,
    setShowing,
    wideWorkspace,
    loadoutInline,
    workspaceMeasured,
    paneHistory,
    closePane,
    openPicker,
    updateLoadoutHistory,
  }
}
