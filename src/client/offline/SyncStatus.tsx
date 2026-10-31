import { exportNativeWork, supportsNativeLocalState } from '../nativeBridge'
import { posthog } from 'posthog-js'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/Dialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Problem } from '../components/Problem'
import { meQuery } from '../queries/account'
import { localEngine, localOwner, restoreLocalWork, syncLocalWork } from './localRuntime'
import { LOCAL_STATE_EVENT } from './localStorage'
import type { LocalState } from '../../contracts/localState'
import { saveRoster } from '../functions'
import type { LocalRoster } from './localRuntime'
import { discardLocalResource } from './syncEngine'
import { invalidateSyncedQueries } from '../productSignals'
import { downloadFile } from '../downloadFile'
import { errorMessage } from '../queryClient'
import { localWorkKey } from '../queries/queryKeys'
import { countLabel } from '../text'

/** Opens the sync dialog; a `'sign-out'` detail asks before signing out with local changes. */
export const OPEN_SYNC_EVENT = 'praetorium-open-sync'

export function SyncStatus() {
  const client = useQueryClient()
  const { data: me } = useQuery(meQuery())
  const { data: state } = useQuery<LocalState | null>({
    queryKey: localWorkKey(),
    queryFn: async () => (await localEngine()?.storage.read()) ?? null,
    enabled: Boolean(me),
    staleTime: Infinity,
  })
  const [online, setOnline] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [pendingOwner, setPendingOwner] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [discard, setDiscard] = useState<string | null>(null)
  const [discardProblem, setDiscardProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncChecked, setSyncChecked] = useState(false)
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
          const before = (await localEngine()?.storage.read())?.operations ?? []
          await syncLocalWork()
          if (!active) return
          failures = 0
          setProblem(null)
          const after = new Set((await localEngine()?.storage.read())?.operations.map(({ id }) => id))
          void invalidateSyncedQueries(
            client,
            before.filter(({ id }) => !after.has(id)),
          )
        }
        operationsPending = Boolean((await localEngine()?.storage.read())?.operations.length)
      } catch (error) {
        if (!active) return
        failures++
        setProblem(errorMessage(error, 'Waiting to reconnect.'))
      } finally {
        running = false
        if (active) timer = setTimeout(() => void run(), operationsPending ? Math.min(60_000, 2_000 * 2 ** Math.min(failures, 5)) : 60_000)
      }
    }
    const wake = () => {
      setOnline(navigator.onLine)
      void run()
    }
    const storage = (event: StorageEvent) => {
      if (event.key === LOCAL_STATE_EVENT) wake()
    }
    const show = (event: Event) => {
      setSigningOut(event instanceof CustomEvent && event.detail === 'sign-out')
      setOpen(true)
    }
    void run()
    window.addEventListener('online', wake)
    window.addEventListener('offline', wake)
    window.addEventListener('storage', storage)
    window.addEventListener(LOCAL_STATE_EVENT, wake)
    window.addEventListener(OPEN_SYNC_EVENT, show)
    document.addEventListener('visibilitychange', wake)
    return () => {
      active = false
      clearTimeout(timer)
      window.removeEventListener('online', wake)
      window.removeEventListener('offline', wake)
      window.removeEventListener('storage', storage)
      window.removeEventListener(LOCAL_STATE_EVENT, wake)
      window.removeEventListener(OPEN_SYNC_EVENT, show)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [client, me])
  const operations = state?.owner === me?.id ? (state?.operations ?? []) : []
  const groups = [...new Set(operations.map((operation) => operation.resource))]
  const conflicts = operations.filter((operation) => operation.status !== 'pending')
  const pendingOnline = online && operations.length > 0
  const owner = me?.impersonatedBy ? undefined : me?.id
  // Work that stops waiting, or another account, starts the ten seconds again.
  if (pendingOwner !== null && (!pendingOnline || pendingOwner !== owner)) setPendingOwner(null)
  useEffect(() => {
    if (!pendingOnline || !owner) return
    const timer = window.setTimeout(() => setPendingOwner(owner), 10_000)
    return () => window.clearTimeout(timer)
  }, [pendingOnline, owner])
  const exportWork = async () => {
    if (!state || state.owner !== localOwner()?.id) return
    posthog.capture('offline_work_resolved', { action: 'exported' })
    if (await exportNativeWork(state)) return
    downloadFile(`praetorium-offline-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json')
  }
  // A sync in flight acknowledges nothing once its change is gone, so discarding never waits for one.
  const discardResource = async () => {
    const resource = discard
    if (!resource) return
    setBusy(true)
    setDiscardProblem(null)
    try {
      const engine = localEngine()
      if (!engine) throw new Error('Sign in to the account that saved these changes.')
      let dropped = 0
      const discarded = await engine.storage.change((current) => {
        const next = discardLocalResource(current, resource)
        dropped = current.operations.length - next.operations.length
        return next
      })
      posthog.capture('local_work_discarded', { scope: resource === '*' ? 'all' : 'item', operations: dropped })
      await restoreLocalWork()
      void client.resetQueries({
        predicate: (query) => ['roster-access', 'roster-bootstrap', 'shared-roster', 'battle'].includes(String(query.queryKey[0])),
      })
      void client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'local-work' })
      setDiscard(null)
      if (!discarded.operations.length) setOpen(false)
    } catch (error) {
      setDiscardProblem(errorMessage(error, 'Changes could not be discarded.'))
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
      posthog.capture('offline_work_resolved', { action: 'kept-copy' })
      setDiscard(resource)
    } catch (error) {
      setProblem(errorMessage(error, 'The copy could not be saved.'))
    } finally {
      setBusy(false)
    }
  }
  const sync = async () => {
    setSyncing(true)
    setSyncChecked(false)
    setProblem(null)
    try {
      await syncLocalWork()
      setSyncChecked(true)
    } catch (error) {
      setProblem(errorMessage(error, 'Waiting to reconnect.'))
    } finally {
      setSyncing(false)
    }
  }
  const syncFeedback =
    syncChecked && !syncing && operations.length
      ? conflicts.length
        ? 'Some saved changes need review. Choose how to keep or discard them below before they can sync.'
        : 'Changes are still waiting to sync. Check your connection and try again.'
      : null
  if (!me || me.impersonatedBy) return null
  const label = conflicts.length
    ? 'Review saved changes'
    : operations.length && (!online || pendingOwner === me.id)
      ? `${countLabel(operations.length, 'change')} waiting to sync`
      : !online
        ? 'Offline · Saved data'
        : null
  return (
    <>
      {label ? (
        <output className="flex shrink-0 items-center justify-between gap-3 border-b border-edge bg-panel px-4 py-2 text-xs">
          <span>{label}</span>
          <button type="button" className="text-info underline underline-offset-4" onClick={() => setOpen(true)}>
            Details
          </button>
        </output>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setSigningOut(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saved changes</DialogTitle>
            <DialogDescription>
              Edits are saved on this device until they sync; invitations, tournament admissions, roster sealing and reveals take effect
              once the server accepts them. {supportsNativeLocalState() ? 'Keep this app installed' : 'Keep this browser’s site data'} until
              then.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {signingOut && operations.length ? (
              <output className="block text-sm text-discarded">Sign-out is waiting: sync, export or discard these changes first.</output>
            ) : null}
            {problem || syncFeedback ? <output className="block text-sm text-dim">{problem || syncFeedback}</output> : null}
            {!operations.length ? <p className="text-sm text-dim">All changes have synced.</p> : null}
            {groups.map((resource) => {
              const group = operations.filter((operation) => operation.resource === resource)
              const failed = group.find((operation) => operation.status !== 'pending')
              const document = state?.documents[resource]?.data as { name?: string; battle?: { token: string } } | null
              const title =
                document?.name ||
                (resource.startsWith('battle:')
                  ? 'Battle'
                  : resource.startsWith('sealed-event:')
                    ? 'Tournament'
                    : resource.startsWith('query:')
                      ? 'Preferences'
                      : 'Saved action')
              return (
                <div key={resource} className="space-y-2 border border-edge p-3">
                  <p className="text-sm font-semibold">
                    {title} · {failed ? 'Needs review' : 'Waiting to sync'}
                  </p>
                  <p className="text-sm text-dim">
                    {failed?.message || `${countLabel(group.length, 'saved action')} waiting for a connection.`}
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
                  onClick={() => void exportWork().catch((error) => setProblem(errorMessage(error, 'Export failed.')))}
                >
                  Export saved changes
                </Button>
                <Button variant="outline" disabled={syncing} onClick={() => void sync()}>
                  {syncing ? 'Syncing…' : 'Sync now'}
                </Button>
                <Button variant="ghost" onClick={() => setDiscard('*')}>
                  Discard all saved changes
                </Button>
              </div>
            ) : null}
            <p className="text-xs text-dim">
              Saved rosters, references, simulations and downloaded battles work offline; new screens and other players’ updates need a
              connection.
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discard !== null}
        title="Discard saved changes?"
        description={
          <>
            This removes {discard === '*' ? 'all unsynced edits and actions' : 'the unsynced edits and actions for this item'} from this
            device and loads the server’s version. Export your changes first if you want to keep them.
          </>
        }
        cancel="Keep changes"
        confirm="Discard changes"
        destructive
        pending={busy}
        disabled={!online}
        onClose={() => {
          setDiscard(null)
          setDiscardProblem(null)
        }}
        onConfirm={() => void discardResource()}
      >
        {discardProblem ? <Problem>{discardProblem}</Problem> : null}
        {online ? null : <p className="text-sm text-dim">Reconnect to discard: the server’s version has to load first.</p>}
      </ConfirmDialog>
    </>
  )
}
