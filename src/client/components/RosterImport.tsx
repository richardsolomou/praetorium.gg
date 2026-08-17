import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { strFromU8 } from 'fflate'
import { Copy, FileUp, LoaderCircle, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_GAME_LIMIT } from '../../core/battle'
import { importRoster, saveRoster } from '../../server/functions'
import { errorMessage } from '../queryClient'
import { savedRostersQuery } from '../queries'

export function RosterImport() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const bring = useMutation({
    mutationFn: async (source: File | string) => {
      let file: string
      if (typeof source === 'string') file = source
      else if (source.name.toLowerCase().endsWith('.rosz')) {
        file = btoa(strFromU8(new Uint8Array(await source.arrayBuffer()), true))
      } else file = await source.text()

      const imported = await importRoster({ data: { file } })
      if (!imported.catalogueId) throw new Error(`Could not place: ${imported.unknown.join(', ') || imported.catalogueName || 'faction'}`)
      if (imported.unknown.length) throw new Error(`Could not place: ${imported.unknown.join(', ')}`)
      const id = crypto.randomUUID()
      await saveRoster({
        data: {
          id,
          name: imported.name,
          catalogueId: imported.catalogueId,
          detachmentIds: imported.detachmentIds,
          disposition: 'disposition' in imported ? (imported.disposition ?? null) : null,
          limit: 'limit' in imported && imported.limit ? imported.limit : DEFAULT_GAME_LIMIT,
          picks: imported.units,
          prep: null,
          tags: [],
          visibility: 'private',
          source: typeof source === 'string' ? 'battlebase' : 'roster-file',
        },
      })
      return id
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: savedRostersQuery().queryKey })
      setOpen(false)
      setText('')
      await navigate({ to: '/rosters/$id/edit', params: { id } })
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
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-none border border-edge bg-panel text-bone ring-0 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl uppercase">Import roster</DialogTitle>
            <DialogDescription className="text-dim">
              Paste a BattleBase export, or add a BattleScribe or New Recruit roster file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="battlebase-roster" className="eyebrow">
              BattleBase text
            </Label>
            <Textarea
              id="battlebase-roster"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={'Paste the full export, including “Exported with BattleBase”…'}
              className="h-52 min-h-52 field-sizing-fixed resize-none overflow-y-auto rounded-none border-edge bg-sunken font-mono text-xs"
              disabled={bring.isPending}
            />
            <Button className="w-full" disabled={!text.trim() || bring.isPending} onClick={() => bring.mutate(text)}>
              {bring.isPending ? <LoaderCircle className="animate-spin" /> : <Copy />}
              Import pasted roster
            </Button>
          </div>

          <div className="flex items-center gap-3 text-xs text-faint" aria-hidden>
            <span className="h-px flex-1 bg-edge" />
            or
            <span className="h-px flex-1 bg-edge" />
          </div>

          <div
            className={`border border-dashed p-5 text-center transition-colors ${dragging ? 'border-azure bg-raised' : 'border-edge bg-sunken'}`}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const file = event.dataTransfer.files[0]
              if (file) bring.mutate(file)
            }}
          >
            <Upload className="mx-auto size-5 text-azure" />
            <p className="mt-2 text-sm font-semibold uppercase">Drop a roster file here</p>
            <p className="mt-1 text-xs text-dim">BattleScribe or New Recruit .ros and .rosz files</p>
            <Button variant="outline" className="mt-3" onClick={() => input.current?.click()} disabled={bring.isPending}>
              Choose file
            </Button>
            <Input
              ref={input}
              type="file"
              accept=".ros,.rosz"
              disabled={bring.isPending}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) bring.mutate(file)
                event.target.value = ''
              }}
            />
          </div>

          {bring.error ? (
            <p role="alert" className="text-sm text-destructive">
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
