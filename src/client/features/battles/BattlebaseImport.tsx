import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { posthog } from 'posthog-js'
import { type ReactNode, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogBody, DialogFooter } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import { ProgressBar } from '../../components/ProgressBar'
import { battlebaseAccount, battlebaseImportCode, importBattlebaseBattles } from '../../functions'
import { battlebaseAccountKey, battlesKey } from '../../queries/queryKeys'
import { countLabel } from '../../text'
import { useCopyText } from '../../useCopyText'

type Imported = { username: string } & Awaited<
  Extract<Awaited<ReturnType<typeof importBattlebaseBattles>>, { outcome: 'imported' }>['counts']
>

/**
 * Imports a player's finished BattleBase battles. The first import links the BattleBase account
 * once its tagline shows a code; every later one is a single press.
 */
export function BattlebaseImport({ picker, onBusy, onDone }: { picker: ReactNode; onBusy: (busy: boolean) => void; onDone: () => void }) {
  const [username, setUsername] = useState('')
  const [switching, setSwitching] = useState(false)
  const queryClient = useQueryClient()
  const account = useQuery({ queryKey: battlebaseAccountKey(), queryFn: () => battlebaseAccount() })
  const linked = switching ? null : (account.data ?? null)
  const { copy, copied, problem: copyProblem, reset: resetCopy } = useCopyText()
  const code = useMutation({
    mutationFn: () => battlebaseImportCode({ data: { username: username.trim() } }),
    onSuccess: () => posthog.capture('battle_import_code_shown', { source: 'battlebase' }),
  })
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const run = useMutation({
    onMutate: () => posthog.capture('battle_import_started', { source: 'battlebase', linked: Boolean(linked) }),
    onError: () => posthog.capture('battle_import_failed', { source: 'battlebase', reason: 'request' }),
    mutationFn: async () => {
      setProgress(null)
      const result = await importBattlebaseBattles({ data: linked ? {} : { username: username.trim() } })
      if (result.outcome !== 'imported') return result
      const total = result.outcomes.length
      let done = 0
      setProgress({ done, total })
      for (const outcome of result.outcomes)
        void outcome.then(
          () => setProgress({ done: ++done, total }),
          () => {},
        )
      return { outcome: result.outcome, username: result.username, ...(await result.counts) }
    },
    onSuccess: async (result) => {
      if (result.outcome !== 'imported') return posthog.capture('battle_import_failed', { source: 'battlebase', reason: result.outcome })
      posthog.capture('battles_imported', {
        source: 'battlebase',
        imported: result.imported,
        joined: result.joined,
        already_imported: result.alreadyImported,
        unfinished: result.unfinished,
        skipped: result.skipped,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: battlebaseAccountKey() }),
        queryClient.invalidateQueries({ queryKey: battlesKey() }),
        queryClient.invalidateQueries({ queryKey: ['player-profile'] }),
      ])
    },
  })
  useEffect(() => onBusy(run.isPending), [run.isPending, onBusy])
  const restart = () => {
    code.reset()
    run.reset()
    resetCopy()
  }
  const imported = run.data?.outcome === 'imported' ? run.data : null

  return (
    <>
      {imported ? (
        <ImportResult result={imported} />
      ) : (
        <DialogBody>
          {picker}
          {linked ? (
            <>
              <p className="text-sm">
                Your BattleBase account is <strong>{linked.username}</strong>. Importing again brings in games you finished there since.
              </p>
              {run.error ? <Problem error={run.error} /> : null}
              <Button variant="link" className="h-auto self-start p-0" onClick={() => setSwitching(true)}>
                Use a different BattleBase account
              </Button>
            </>
          ) : (
            <>
              <form
                className="space-y-1"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (username.trim()) code.mutate()
                }}
              >
                <Label htmlFor="battlebase-username">BattleBase username</Label>
                <div className="flex gap-2">
                  <Input
                    id="battlebase-username"
                    value={username}
                    maxLength={64}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="h-11"
                    onChange={(event) => {
                      setUsername(event.target.value)
                      restart()
                    }}
                  />
                  {code.data ? null : (
                    <Button type="submit" className="h-11" disabled={!username.trim() || code.isPending}>
                      {code.isPending ? 'Checking…' : 'Next'}
                    </Button>
                  )}
                </div>
              </form>
              {code.error ? <Problem error={code.error} /> : null}
              {code.data ? (
                <div className="space-y-3">
                  <p className="text-sm">
                    To show the BattleBase account is yours, add this code to your BattleBase tagline: open your profile there, choose{' '}
                    <strong>Add tagline</strong> or <strong>Edit</strong>, paste it and save.
                  </p>
                  <div className="flex items-center gap-2 border border-edge bg-sunken p-3">
                    <code className="min-w-0 flex-1 truncate font-mono text-base">{code.data.code}</code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void copy(code.data.code, { failure: 'Copy failed. Select the code instead.', operation: 'battlebase_code_copy' })
                      }
                    >
                      <Copy /> {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  {copyProblem ? <Problem>{copyProblem}</Problem> : null}
                  <p className="text-xs text-dim">You can remove it once your games are here.</p>
                  {run.data?.outcome === 'unverified' ? (
                    <Problem>Your BattleBase tagline doesn’t show the code yet. Save it there, then try again.</Problem>
                  ) : run.data?.outcome === 'not-found' ? (
                    <Problem>No BattleBase player is called {username.trim()}.</Problem>
                  ) : run.error ? (
                    <Problem error={run.error} />
                  ) : null}
                </div>
              ) : null}
            </>
          )}
          {run.isPending ? (
            <ProgressBar
              label="Battles read"
              value={progress?.done}
              max={progress?.total}
              status={progress?.total ? `Read ${progress.done} of ${countLabel(progress.total, 'battle')}…` : 'Finding your battles…'}
            />
          ) : null}
        </DialogBody>
      )}
      <DialogFooter>
        {imported ? (
          <Button onClick={onDone}>Done</Button>
        ) : (
          <Button disabled={(!linked && !code.data) || account.isPending || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? 'Importing…' : 'Import battles'}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

function ImportResult({ result }: { result: Imported }) {
  const added = result.imported + result.joined
  const notes = [
    result.alreadyImported ? `${countLabel(result.alreadyImported, 'game')} already here` : null,
    result.unfinished ? countLabel(result.unfinished, 'unfinished game') : null,
    result.skipped ? `${countLabel(result.skipped, 'game')} that couldn’t be read` : null,
  ].filter(Boolean)
  return (
    <DialogBody>
      <output className="block text-lg font-bold">{added ? `Added ${countLabel(added, 'battle')}.` : 'No new battles to add.'}</output>
      {result.joined ? (
        <p className="text-sm">
          {countLabel(result.joined, 'battle')} an opponent had already brought in now {result.joined === 1 ? 'has' : 'have'} you in your
          seat.
        </p>
      ) : null}
      {notes.length ? <p className="text-sm text-dim">Left out: {notes.join(', ')}.</p> : null}
      <p className="text-sm text-dim">
        Your BattleBase account {result.username} is linked, so games anyone brings in with you in them put you in your seat. You can remove
        the code from your tagline.
      </p>
    </DialogBody>
  )
}
