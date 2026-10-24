import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { useCallback, useRef } from 'react'

type DialogLocationState = { historyDialog?: { hash: string; value: string } }

/**
 * A dialog held in its own history entry, so the system Back gesture closes it instead of leaving the page.
 *
 * The open dialog's value lives in the entry's state behind `#hash`; closing steps back over that
 * entry, as `useRosterPanes` does for compact roster panes. Only `open` pushes that entry, so the one
 * behind it is this page even after a reload; it is replaced only when nothing of this tab's is behind it.
 * Dialogs opt in: one that closes by navigating, or that the address opens, would leave a stale entry behind.
 */
export function useHistoryDialog(hash: string) {
  const navigate = useNavigate()
  const router = useRouter()
  const value = useRouterState({
    select: (state) => {
      const dialog = (state.location.state as DialogLocationState).historyDialog
      return state.location.hash === hash && dialog?.hash === hash ? dialog.value : null
    },
  })
  /** The entry a close already stepped back from, so a second close before the step lands does not leave the page. */
  const leaving = useRef<string | undefined>(undefined)

  const open = useCallback(
    (next: string) => {
      const current = router.history.location.state as DialogLocationState
      void navigate({
        to: '.',
        search: true,
        hash,
        hashScrollIntoView: false,
        resetScroll: false,
        replace: current.historyDialog?.hash === hash,
        state: (state) => ({ ...state, historyDialog: { hash, value: next } }) as typeof state,
      })
    },
    [hash, navigate, router],
  )

  const close = useCallback(() => {
    const entry = router.history.location.state as DialogLocationState & { __TSR_index: number; __TSR_key?: string }
    if (entry.historyDialog?.hash !== hash || leaving.current === entry.__TSR_key) return
    leaving.current = entry.__TSR_key
    if (entry.__TSR_index > 0) router.history.back()
    else
      void navigate({
        to: '.',
        search: true,
        hash: '',
        replace: true,
        resetScroll: false,
        state: (state) => ({ ...state, historyDialog: undefined }),
      })
  }, [hash, navigate, router])

  return [value, open, close] as const
}
