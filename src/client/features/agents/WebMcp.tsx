import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { browserAgentToolCatalog, callBrowserAgentTool, prepareBrowserAgentTool } from '../../functions'
import { meQuery } from '../../queries'
import { isFetchNetworkFailure } from '../../networkErrors'
import { captureAppSnapshot } from '../../offline/appSnapshot'
import { writeAppSnapshot, APP_ACCOUNT_EVENT } from '../../offline/appStorage'
import type { AgentToolDescriptor } from '../../../contracts/agentTools'
import { browserModelContext, installWebMcp, type ToolResult } from './registerWebMcp'
import { WriteApproval, type WriteProposal } from './WriteApproval'
import { withTimeout } from '../../abortSignals'
import { Problem } from '../../components/Problem'

export function WebMcp() {
  const client = useQueryClient()
  const { data: me } = useQuery(meQuery())
  const userId = me && !me.impersonatedBy ? me.id : null
  const [proposal, setProposal] = useState<WriteProposal | null>(null)
  const approval = useMemo(() => new WriteApproval(setProposal), [])

  useEffect(() => {
    const context = browserModelContext()
    if (!context) return
    // Each registration owns its lifetime, so a write that finishes after an account change reports against the old one.
    const register = () => {
      const lifetime = new AbortController()
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
                  signal: withTimeout(signal, 30_000),
                }),
              approve: (tool, input, summary, signal) => approval.request(tool, input, summary, signal),
              finishWrite: (error) => {
                if (!lifetime.signal.aborted) approval.finish(error)
              },
              invoke: async (tool, input, signal) => {
                // Once a write is dispatched, cancellation cannot undo it; await its result without retrying.
                const serialized = await callBrowserAgentTool({
                  data: { name: tool.name, input, expectedUserId: userId },
                  signal: withTimeout(tool.readOnly ? signal : undefined, 30_000),
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
          if (!lifetime.signal.aborted && !isFetchNetworkFailure(error))
            posthog.captureException(error, { operation: 'webmcp_registration' })
          lifetime.abort()
        })
      return lifetime
    }
    let current = register()
    const accountChanged = (event: StorageEvent) => {
      if (event.key !== APP_ACCOUNT_EVENT) return
      current.abort()
      approval.dismiss()
      current = register()
    }
    window.addEventListener('storage', accountChanged)
    return () => {
      current.abort()
      approval.dismiss()
      window.removeEventListener('storage', accountChanged)
    }
  }, [client, userId, approval])

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
      <DialogContent showCloseButton={!saving} className="ph-no-capture" aria-busy={saving}>
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
        <DialogBody>
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
            <Problem>{proposal.error} Check the saved roster or battle before asking your assistant to try again.</Problem>
          ) : null}
        </DialogBody>
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
