import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { browserAgentToolCatalog, callBrowserAgentTool, prepareBrowserAgentTool } from '../../../server/functions/agentTools'
import { meQuery } from '../../queries'
import { captureAppSnapshot } from '../../offline/appSnapshot'
import { writeAppSnapshot } from '../../offline/appStorage'
import { APP_ACCOUNT_EVENT } from '../../offline/appStorage'
import type { AgentToolDescriptor } from '../../../contracts/agentTools'
import { browserModelContext, installWebMcp, type ToolResult } from './registerWebMcp'
import { WriteApproval, type WriteProposal } from './WriteApproval'

export function WebMcp() {
  const client = useQueryClient()
  const { data: me } = useQuery(meQuery())
  const userId = me && !me.impersonatedBy ? me.id : null
  const [accountGeneration, setAccountGeneration] = useState(0)
  const [proposal, setProposal] = useState<WriteProposal | null>(null)
  const approval = useMemo(() => new WriteApproval(setProposal), [])

  useEffect(() => {
    const context = browserModelContext()
    if (!context) return
    const lifetime = new AbortController()
    const accountChanged = (event: StorageEvent) => {
      if (event.key === APP_ACCOUNT_EVENT) {
        lifetime.abort()
        approval.dismiss()
        setAccountGeneration((generation) => generation + 1)
      }
    }
    window.addEventListener('storage', accountChanged)
    void browserAgentToolCatalog({ signal: lifetime.signal })
      .then((catalog) =>
        installWebMcp(
          context,
          (JSON.parse(catalog) as AgentToolDescriptor[]).filter((tool) => !tool.account || userId !== null),
          {
            signal: lifetime.signal,
            prepare: (tool, input, signal) =>
              prepareBrowserAgentTool({
                data: { name: tool.name, input, expectedUserId: userId },
                signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
              }),
            approve: (tool, input, summary, signal) => approval.request(tool, input, summary, signal),
            finishWrite: (error) => {
              if (!lifetime.signal.aborted) approval.finish(error)
            },
            invoke: async (tool, input, signal) => {
              // Once a write is dispatched, cancellation cannot undo it; await its result without retrying.
              const serialized = await callBrowserAgentTool({
                data: { name: tool.name, input, expectedUserId: userId },
                signal: tool.readOnly ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
              })
              const result = JSON.parse(serialized) as ToolResult
              if (lifetime.signal.aborted)
                return {
                  content: [{ type: 'text' as const, text: 'Your account changed. Check the result after signing in.' }],
                  isError: true,
                }
              if (!tool.readOnly) {
                await client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'me' }).catch(() => {})
                await writeAppSnapshot(captureAppSnapshot(client)).catch(() => {})
              }
              return result
            },
          },
        ),
      )
      .catch((error: unknown) => {
        if (!lifetime.signal.aborted) posthog.captureException(error, { operation: 'webmcp_registration' })
        lifetime.abort()
      })
    return () => {
      lifetime.abort()
      approval.dismiss()
      window.removeEventListener('storage', accountChanged)
    }
  }, [client, userId, approval, accountGeneration])

  if (!proposal) return null
  const saving = proposal.status === 'saving'
  const failed = proposal.status === 'failed'
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) approval.dismiss()
      }}
    >
      <DialogContent showCloseButton={!saving} className="ph-no-capture sm:max-w-lg" aria-busy={saving}>
        <DialogHeader>
          <DialogTitle>{proposal.tool.title}</DialogTitle>
          <DialogDescription>
            {saving
              ? 'Saving the approved change…'
              : failed
                ? 'The change could not be confirmed.'
                : 'Your assistant proposes this change. Check the details before approving it.'}
          </DialogDescription>
        </DialogHeader>
        <p className="text-bone">{proposal.summary}</p>
        <details>
          <summary className="cursor-pointer text-dim">All proposed changes</summary>
          <dl className="grid min-w-0 gap-3">
            {Object.entries(proposal.input).map(([key, value]) => (
              <div key={key} className="min-w-0">
                <dt className="eyebrow">{key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')}</dt>
                <dd className="mt-1 break-words whitespace-pre-wrap text-bone">
                  {value !== null && typeof value === 'object' ? (
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(value, null, 2)}</pre>
                  ) : typeof value === 'string' ? (
                    value
                  ) : (
                    (JSON.stringify(value) ?? 'None')
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </details>
        {proposal.error ? (
          <p role="alert" className="text-danger">
            {proposal.error} Check the saved roster or battle before asking your assistant to try again.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => approval.dismiss()}>
            {failed ? 'Close' : 'Decline'}
          </Button>
          {!failed ? (
            <Button
              disabled={saving}
              onClick={(event) => {
                if (event.isTrusted) approval.approve()
              }}
            >
              {saving ? 'Saving…' : 'Approve change'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
