import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { removeCalendarFeed, replaceCalendarFeed } from '../../functions'
import { calendarFeedQuery } from '../../queries'
import { useCopyText } from '../../useCopyText'
import { useOrigin } from '../../useOrigin'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Problem } from '../../components/Problem'

/** The address a calendar app subscribes to for the player's league and tournament dates, and replacing or turning it off. */
export function CalendarFeedSettings() {
  const { data: token } = useQuery(calendarFeedQuery())
  const origin = useOrigin()
  const queryClient = useQueryClient()
  const { copy, copied, problem: copyProblem, reset } = useCopyText()
  // The action outlives the dialog's close, so its words stay put while it animates away.
  const [dialog, setDialog] = useState<{ action: 'replace' | 'remove'; open: boolean }>({ action: 'replace', open: false })
  const settle = (next: string | null) => {
    reset()
    setDialog((current) => ({ ...current, open: false }))
    queryClient.setQueryData(calendarFeedQuery().queryKey, next)
  }
  const replace = useMutation({ mutationFn: () => replaceCalendarFeed(), onSuccess: settle })
  const remove = useMutation({ mutationFn: () => removeCalendarFeed(), onSuccess: () => settle(null) })
  const ask = (action: 'replace' | 'remove') => {
    replace.reset()
    remove.reset()
    setDialog({ action, open: true })
  }
  const removing = dialog.action === 'remove'
  const url = token && origin ? `${origin}/api/calendar/${token}.ics` : null
  return (
    <section className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <div>
        <h3 className="text-base">Calendar</h3>
        <p className="mt-1 text-sm text-dim">League round deadlines and tournament dates in your own calendar app.</p>
      </div>
      <div className="space-y-3">
        {url ? (
          <>
            <Input readOnly value={url} aria-label="Calendar link" onFocus={(event) => event.currentTarget.select()} />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void copy(url, { failure: 'Copy failed. Select the link to copy it.', operation: 'calendar_feed_copy' })}
              >
                {copied ? <Check /> : <Copy />} {copied ? 'Link copied' : 'Copy link'}
              </Button>
              <Button variant="ghost" onClick={() => ask('replace')}>
                Replace link
              </Button>
              <Button variant="ghost" className="text-dim hover:text-destructive" onClick={() => ask('remove')}>
                Turn off
              </Button>
            </div>
            <p className="text-xs text-dim">Anyone with this link can see these dates. Replace it if someone else has it.</p>
          </>
        ) : (
          <Button variant="outline" disabled={token === undefined || !origin || replace.isPending} onClick={() => replace.mutate()}>
            <CalendarPlus /> {replace.isPending ? 'Creating…' : 'Get calendar link'}
          </Button>
        )}
        {copyProblem ? <Problem>{copyProblem}</Problem> : null}
        {!dialog.open && replace.error ? <Problem error={replace.error} /> : null}
      </div>
      <ConfirmDialog
        open={dialog.open}
        title={removing ? 'Turn off the calendar link?' : 'Replace the calendar link?'}
        description={
          removing
            ? 'Calendars that use the link stop getting updates.'
            : 'The old link stops working. Add the new link to your calendar app again.'
        }
        cancel="Keep link"
        confirm={removing ? 'Turn off' : 'Replace link'}
        destructive
        pending={replace.isPending || remove.isPending}
        error={(removing ? remove.error : replace.error) ?? null}
        onClose={() => setDialog((current) => ({ ...current, open: false }))}
        onConfirm={() => (removing ? remove.mutate() : replace.mutate())}
      />
    </section>
  )
}
