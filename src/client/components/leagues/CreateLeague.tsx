import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { createLeague } from '../../../server/functions'
import { leaguesQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { LeagueFormFields, type LeagueFormValue } from './LeagueForm'

export function CreateLeague() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<LeagueFormValue>({
    name: '',
    description: '',
    visibility: 'private',
    admission: 'approval',
    playerLimit: null,
  })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: () => createLeague({ data: value }),
    onSuccess: async ({ token, eventToken }) => {
      await queryClient.invalidateQueries({ queryKey: leaguesQuery().queryKey })
      setOpen(false)
      await navigate({ to: '/leagues/$token', params: { token }, search: { event: eventToken } })
    },
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && setOpen(next)}>
      <DialogTrigger render={<Button />}>
        <Plus /> New league
      </DialogTrigger>
      <DialogContent
        showCloseButton={!create.isPending}
        aria-busy={create.isPending}
        className="max-h-[90dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">Create league</DialogTitle>
          <DialogDescription className="text-dim">
            Open registration for a league, tournament, or club night. You choose the game format and points once it exists.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <LeagueFormFields idPrefix="create-league" value={value} disabled={create.isPending} onChange={setValue} />
          {create.isPending ? <output className="sr-only">Creating league…</output> : null}
          {create.error ? <p className="text-sm text-destructive">{errorMessage(create.error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={create.isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !value.name.trim()}>
              {create.isPending ? 'Creating…' : 'Create league'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
