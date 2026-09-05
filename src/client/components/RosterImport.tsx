import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Copy, FileUp, LoaderCircle } from 'lucide-react'
import posthog from 'posthog-js'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { importRoster } from '../../server/functions'
import { errorMessage } from '../queryClient'
import { invalidateSavedRosters } from '../queries'

/** Each name the import could not resolve, on its own line, so the player reads why rather than only what. */
const explain = (unknown: readonly { name: string; reason: string }[]) =>
  unknown.map(({ name, reason }) => `Could not match ${name}: ${reason}.`).join('\n')

export function RosterImport() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // A faction nobody recognises is the only refusal left, because there is no book to
  // build anything from. Everything else the import could not read is saved with the
  // list and said again in the editor, where the player can act on it.
  const bring = useMutation({
    mutationFn: async (file: string) => {
      const imported = await importRoster({ data: { file } })
      if (!imported.id) {
        posthog.capture('roster_import_failed', { reason: 'catalogue_unmatched', input: 'text' })
        throw new Error(explain(imported.unknown) || `Could not match ${imported.catalogueName || 'the faction'}`)
      }
      return imported.id
    },
    onSuccess: async (id) => {
      await invalidateSavedRosters(queryClient)
      setOpen(false)
      setText('')
      await navigate({ to: '/rosters/$id', params: { id } })
    },
  })

  const show = () => {
    bring.reset()
    setOpen(true)
  }

  return (
    <>
      <Button variant="outline" onClick={show}>
        <FileUp /> Import roster
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border border-edge bg-panel text-bone ring-0 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl uppercase">Import roster</DialogTitle>
            <DialogDescription className="text-dim">
              Paste Games Workshop roster text from Praetorium, BattleBase, or New Recruit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="roster-text" className="eyebrow">
              Roster text
            </Label>
            <Textarea
              id="roster-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste Games Workshop roster text…"
              className="h-52 min-h-52 field-sizing-fixed resize-none overflow-y-auto rounded-none border-edge bg-sunken font-mono text-xs"
              disabled={bring.isPending}
            />
            <Button className="w-full" disabled={!text.trim() || bring.isPending} onClick={() => bring.mutate(text)}>
              {bring.isPending ? <LoaderCircle className="animate-spin" /> : <Copy />}
              Import pasted roster
            </Button>
          </div>

          {bring.error ? (
            <p role="alert" className="whitespace-pre-line text-sm text-destructive">
              {errorMessage(bring.error)}
            </p>
          ) : null}
          <DialogFooter className="rounded-none border-edge bg-sunken">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
