import { exportNativeWork } from '../nativeBridge'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { meQuery } from '../queries/account'
import { localEngine, localOwner, restoreLocalWork, syncLocalWork } from './localRuntime'
import { LOCAL_STATE_EVENT } from './localStorage'
import type { LocalState } from '../../contracts/localState'
import { saveRoster } from '../functions'
import type { LocalRoster } from './localRuntime'
import { discardLocalResource } from './syncEngine'

export function SyncStatus() {
  const client = useQueryClient()
  const { data: me } = useQuery(meQuery())
  const { data: state } = useQuery<LocalState | null>({
    queryKey: ['local-work'],
    queryFn: async () => (await localEngine()?.storage.read()) ?? null,
    enabled: Boolean(me),
    staleTime: Infinity,
  })
  const [online, setOnline] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [discard, setDiscard] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!me || me.impersonatedBy) return
    let active = true
    let running = false
    let failures = 0
    let operationsPending = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = async () => {
      if (!active || running) return
      running = true
      clearTimeout(timer)
      setOnline(navigator.onLine)
      try {
        operationsPending = true
        await restoreLocalWork()
        if (navigator.onLine && document.visibilityState === 'visible') {
          const before = (await localEngine()?.storage.read())?.operations.length ?? 0
          await syncLocalWork()
          if (!active) return
          failures = 0
          setProblem(null)
          const after = (await localEngine()?.storage.read())?.operations.length ?? 0
          if (before > after)
            void client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'local-work' && query.queryKey[0] !== 'me' })
        }
        operationsPending = Boolean((await localEngine()?.storage.read())?.operations.length)
      } catch (error) {
        if (!active) return
        failures++
        setProblem(error instanceof Error ? error.message : 'Waiting to reconnect.')
      } finally {
        running = false
        if (active) timer = setTimeout(() => void run(), operationsPending ? Math.min(60_000, 2_000 * 2 ** Math.min(failures, 5)) : 60_000)
      }
    }
    const wake = () => void run()
    const storage = (event: StorageEvent) => {
      if (event.key === LOCAL_STATE_EVENT) wake()
    }
    const show = () => setOpen(true)
    void run()
    window.addEventListener('online', wake)
    window.addEventListener('offline', wake)
    window.addEventListener('storage', storage)
    window.addEventListener(LOCAL_STATE_EVENT, wake)
    window.addEventListener('praetorium-open-sync', show)
    document.addEventListener('visibilitychange', wake)
    return () => {
      active = false
      clearTimeout(timer)
      window.removeEventListener('online', wake)
      window.removeEventListener('offline', wake)
      window.removeEventListener('storage', storage)
      window.removeEventListener(LOCAL_STATE_EVENT, wake)
      window.removeEventListener('praetorium-open-sync', show)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [client, me])
  const operations = state?.owner === me?.id ? (state?.operations ?? []) : []
  const groups = [...new Set(operations.map((operation) => operation.resource))]
  const conflicts = operations.filter((operation) => operation.status !== 'pending')
  const exportWork = async () => {
    if (!state || state.owner !== localOwner()?.id) return
    if (await exportNativeWork(state)) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `praetorium-offline-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }
  const discardResource = async () => {
    const resource = discard
    const engine = localEngine()
    if (!engine || !resource) return
    setBusy(true)
    try {
      await engine.sync()
      await engine.storage.change((current) => {
        if (current.syncLease && current.syncLease.expiresAt > Date.now())
          throw new Error('A sync is in progress. Wait for it to finish before discarding changes.')
        return discardLocalResource(current, resource)
      })
      await restoreLocalWork()
      client.removeQueries({
        predicate: (query) => ['roster-access', 'roster-bootstrap', 'shared-roster', 'battle'].includes(String(query.queryKey[0])),
      })
      await client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'local-work' })
      setDiscard(null)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Changes could not be updated.')
    } finally {
      setBusy(false)
    }
  }
  const keepCopy = async (resource: string) => {
    const roster = state?.documents[resource]?.data as LocalRoster | null
    if (!roster) return
    setBusy(true)
    try {
      await saveRoster({ data: { ...roster, id: undefined, name: `${roster.name || 'Roster'} (offline copy)`.slice(0, 80) } })
      setDiscard(resource)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The copy could not be saved.')
    } finally {
      setBusy(false)
    }
  }
  if (!me || me.impersonatedBy) return null
  const label = conflicts.length
    ? 'Review saved changes'
    : operations.length
      ? `${operations.length} change${operations.length === 1 ? '' : 's'} waiting to sync`
      : !online
        ? 'Offline · Saved data'
        : null
  return (
    <>
      {label ? (
        <output className="flex shrink-0 items-center justify-between gap-3 border-b border-edge bg-panel px-4 py-2 text-xs">
          <span>{label}</span>
          <button className="text-info underline underline-offset-4" onClick={() => setOpen(true)}>
            Details
          </button>
        </output>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Saved changes</DialogTitle>
            <DialogDescription>
              Edits are saved on this device before syncing. Invitations, league admissions, roster sealing and reveals take effect after
              the server accepts them. Keep this app installed until your changes sync.
            </DialogDescription>
          </DialogHeader>
          {problem ? <p className="text-sm text-dim">{problem}</p> : null}
          {!operations.length ? <p className="text-sm text-dim">All changes have synced.</p> : null}
          {groups.map((resource) => {
            const group = operations.filter((operation) => operation.resource === resource)
            const failed = group.find((operation) => operation.status !== 'pending')
            const document = state?.documents[resource]?.data as { name?: string; battle?: { token: string } } | null
            const title =
              document?.name ||
              (resource.startsWith('battle:')
                ? 'Battle'
                : resource.startsWith('league:')
                  ? 'League'
                  : resource.startsWith('query:')
                    ? 'Preferences'
                    : 'Saved action')
            return (
              <div key={resource} className="space-y-2 border border-edge p-3">
                <p className="text-sm font-semibold">
                  {title} · {failed ? 'Needs review' : 'Pending'}
                </p>
                <p className="text-sm text-dim">
                  {failed?.message || `${group.length} saved action${group.length === 1 ? '' : 's'} waiting for a connection.`}
                </p>
                <div className="flex flex-wrap gap-2">
                  {failed && resource.startsWith('roster:') && document ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void keepCopy(resource)}>
                      Keep as a new roster
                    </Button>
                  ) : null}
                  {failed ? (
                    <Button size="sm" variant="outline" onClick={() => setDiscard(resource)}>
                      Use server version
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
          {operations.length ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void exportWork().catch((error) => setProblem(error instanceof Error ? error.message : 'Export failed.'))}
              >
                Export saved changes
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  void syncLocalWork().catch((error) => setProblem(error instanceof Error ? error.message : 'Waiting to reconnect.'))
                }
              >
                Sync now
              </Button>
              <Button variant="ghost" onClick={() => setDiscard('*')}>
                Discard all saved changes
              </Button>
            </div>
          ) : null}
          <p className="text-xs text-dim">
            New screens and other players’ updates need a connection. Your saved rosters, references, simulations and downloaded battles
            remain available offline.
          </p>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={discard !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !busy) setDiscard(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard saved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {discard === '*' ? 'all unsynced edits and actions' : 'the unsynced edits and actions for this item'} from this
              device and loads the server’s version. Export your changes first if you want to keep them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy || typeof window === 'undefined' || !navigator.onLine} onClick={() => void discardResource()}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
