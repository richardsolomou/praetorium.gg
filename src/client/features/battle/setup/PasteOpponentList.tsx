import { useMutation } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Problem } from '../../../components/Problem'
import { importRoster } from '../../../functions'
import { countLabel } from '../../../text'
import { explain, importedSetup, isMatchedImport } from '../../rosters/RosterImport'

const draftOf = (imported: Parameters<typeof importedSetup>[0], limit: number) => ({
  ...importedSetup(imported, limit),
  picks: imported.units,
  prep: null,
  visibility: 'private' as const,
  source: imported.source,
})

/** A guest's list comes in for this game alone: it is priced and frozen with the battle and never joins the host's library. */
export function PasteOpponentList({
  name,
  limit,
  pending,
  onUse,
}: {
  name: string
  limit: number | null
  pending: boolean
  onUse: (draft: ReturnType<typeof draftOf>) => void
}) {
  const field = useId()
  const [text, setText] = useState('')
  const read = useMutation({ mutationFn: (file: string) => importRoster({ data: { file } }) })
  const imported = read.data && isMatchedImport(read.data) ? read.data : null
  const refused = read.data && !imported ? explain(read.data.unknown) || `Could not read that list.` : null
  const dropped = imported ? imported.unknown.length + imported.unplaced.reduce((total, unit) => total + unit.choices.length, 0) : 0
  return (
    <div data-paste-opponent className="space-y-2 rounded-lg border border-edge bg-sunken p-3">
      <Label htmlFor={field}>Paste {name}’s list</Label>
      <Textarea
        id={field}
        rows={3}
        value={text}
        disabled={pending || read.isPending}
        placeholder="An export from the official app, New Recruit or another list builder"
        onChange={(event) => {
          setText(event.target.value)
          read.reset()
        }}
      />
      {imported ? (
        <p className="text-sm text-dim">
          <span className="font-semibold text-bone">{imported.name}</span> · {countLabel(imported.units.length, 'unit')}
          {dropped ? ` · ${countLabel(dropped, 'entry', 'entries')} could not be matched and will be left out` : ''}
        </p>
      ) : null}
      {refused || read.error ? <Problem error={read.error ?? undefined}>{refused}</Problem> : null}
      <p className="text-xs text-dim">Used for this game only. It won’t be added to your rosters.</p>
      {imported ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            posthog.capture('battle_guest_list_pasted', { missing_count: dropped, pick_count: imported.units.length })
            onUse(draftOf(imported, limit ?? 2000))
          }}
        >
          Use this list
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled={pending || read.isPending || !text.trim()} onClick={() => read.mutate(text)}>
          {read.isPending ? 'Reading…' : 'Read list'}
        </Button>
      )}
    </div>
  )
}
