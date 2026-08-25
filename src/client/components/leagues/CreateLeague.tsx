import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { createLeague } from '../../../server/functions'
import { leaguesQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { Choice, LeagueFormFields, type LeagueFormValue } from './LeagueForm'

export function CreateLeague() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<LeagueFormValue>({
    name: '',
    description: '',
    visibility: 'private',
    admission: 'approval',
    playerLimit: null,
  })
  const [cadence, setCadence] = useState<'one-off' | 'recurring'>('one-off')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: () =>
      createLeague({
        data: {
          ...value,
          recurring: cadence === 'recurring',
        },
      }),
    onSuccess: async ({ token, eventToken }) => {
      await queryClient.invalidateQueries({ queryKey: leaguesQuery().queryKey })
      setOpen(false)
      await navigate({ to: '/leagues/$token', params: { token }, search: { event: eventToken } })
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus /> New league
      </DialogTrigger>
      <DialogContent className="rounded-none border border-edge bg-panel text-bone sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">Create league</DialogTitle>
          <DialogDescription className="text-dim">Open roster registration for a league, tournament, or one-off event.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <LeagueFormFields idPrefix="create-league" value={value} onChange={setValue} />
          <Choice
            label="Events"
            value={cadence}
            options={[
              { value: 'one-off', title: 'One-off', detail: 'Run one registration and roster reveal.' },
              { value: 'recurring', title: 'Recurring', detail: 'Open fresh events from the same league page.' },
            ]}
            onChange={setCadence}
          />
          {create.error ? <p className="text-sm text-destructive">{errorMessage(create.error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !value.name.trim()}>
              Create league
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
