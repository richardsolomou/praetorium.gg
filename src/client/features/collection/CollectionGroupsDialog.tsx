import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type CollectionEntry, type CollectionModelGroup, collectionGroupsSchema, MAX_COLLECTION_MODELS } from '../../../core/collection'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { SearchableSelect } from '../../components/SearchableSelect'
import { setCollectionGroups } from '../../functions'
import { errorMessage } from '../../queryClient'

const fieldClass = 'h-9 w-full min-w-0 rounded-sm border border-edge-strong bg-panel px-2 text-sm text-bone'
type DraftGroup = Omit<CollectionModelGroup, 'builds'> & {
  key: string
  builds: (CollectionModelGroup['builds'][number] & { key: string })[]
}
const draftBuild = (entryId: string, equipment = '') => ({ key: crypto.randomUUID(), entryId, equipment })
const draftGroup = (entryId: string): DraftGroup => ({ key: crypto.randomUUID(), models: 1, state: 'fixed', builds: [draftBuild(entryId)] })
const STATES = { fixed: 'Fixed build', unbuilt: 'Unbuilt', interchangeable: 'Interchangeable' } as const

export function CollectionGroupsDialog({
  entry,
  name,
  datasheets,
  onClose,
}: {
  entry: CollectionEntry
  name: string
  datasheets: { id: string; name: string; faction: string }[]
  onClose: () => void
}) {
  const client = useQueryClient()
  const [groups, setGroups] = useState<DraftGroup[]>(() =>
    (entry.groups ?? [{ models: entry.models, state: 'fixed' as const, builds: [{ entryId: entry.entryId, equipment: '' }] }]).map(
      (group) => ({ ...group, key: crypto.randomUUID(), builds: group.builds.map((build) => draftBuild(build.entryId, build.equipment)) }),
    ),
  )
  const [problem, setProblem] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (value: CollectionModelGroup[] | null) =>
      setCollectionGroups({
        data: { entryId: entry.entryId, groups: value, expectedModels: entry.models, expectedGroups: entry.groups ?? null },
      }),
    onSuccess: async () => {
      await Promise.all(
        ['collection', 'collection-counts', 'collection-inventory', 'collection-profile'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
      onClose()
    },
  })
  const update = (index: number, change: Partial<DraftGroup>) =>
    setGroups((current) => current.map((group, at) => (at === index ? { ...group, ...change } : group)))
  const choices = [...datasheets]
  for (const group of groups)
    for (const build of group.builds)
      if (!choices.some((choice) => choice.id === build.entryId))
        choices.push({ id: build.entryId, name: 'Datasheet from earlier rules', faction: 'Earlier rules' })
  const total = groups.reduce((sum, group) => sum + group.models, 0)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose()
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Model groups: {name}</DialogTitle>
          <DialogDescription>Count each physical model once.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-dim">Count individual models, not boxes or squads.</p>
          {groups.map((group, index) => (
            <fieldset key={group.key} className="min-w-0 space-y-3 border border-edge p-3" disabled={save.isPending}>
              <legend className="px-1 text-sm font-semibold text-bone">Group {index + 1}</legend>
              <div className="flex flex-wrap items-end gap-3">
                <label htmlFor={`${group.key}-models`} className="w-24 space-y-1 text-sm text-dim">
                  Models
                  <Input
                    type="number"
                    min={1}
                    max={MAX_COLLECTION_MODELS}
                    value={group.models}
                    onChange={(event) => update(index, { models: Number(event.target.value) })}
                    id={`${group.key}-models`}
                    aria-label={`Group ${index + 1} models`}
                  />
                </label>
                <label className="min-w-0 flex-1 basis-40 space-y-1 text-sm text-dim">
                  Assembly
                  <select
                    className={fieldClass}
                    aria-label={`Group ${index + 1} assembly`}
                    value={group.state}
                    onChange={(event) => {
                      const state = event.target.value as CollectionModelGroup['state']
                      update(index, { state, ...(state === 'fixed' ? { builds: [group.builds[0]!] } : {}) })
                    }}
                  >
                    {Object.entries(STATES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {groups.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove group ${index + 1}`}
                    onClick={() => setGroups((current) => current.filter((_, at) => at !== index))}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
              {group.builds.map((build, buildIndex) => (
                <div key={build.key} className="space-y-2 border-l-2 border-edge pl-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <SearchableSelect
                      placeholder="Choose a datasheet…"
                      ariaLabel={`Group ${index + 1} build ${buildIndex + 1} datasheet`}
                      className="min-w-0 flex-1"
                      value={build.entryId}
                      onValueChange={(entryId) =>
                        update(index, {
                          builds: group.builds.map((existing, at) => (at === buildIndex ? { ...existing, entryId } : existing)),
                        })
                      }
                      groups={[...new Set(choices.map((choice) => choice.faction))].map((faction) => ({
                        label: faction,
                        items: choices
                          .filter((choice) => choice.faction === faction)
                          .map((choice) => ({ value: choice.id, label: choice.name })),
                      }))}
                      virtualized
                      disabled={buildIndex === 0}
                    />
                    {buildIndex > 0 ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove group ${index + 1} build ${buildIndex + 1}`}
                        onClick={() => update(index, { builds: group.builds.filter((_, at) => at !== buildIndex) })}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                  <label htmlFor={`${build.key}-equipment`} className="block space-y-1 text-sm text-dim">
                    Equipment (optional)
                    <Input
                      className="ph-no-capture"
                      maxLength={200}
                      id={`${build.key}-equipment`}
                      aria-label={`Group ${index + 1} build ${buildIndex + 1} equipment`}
                      value={build.equipment}
                      placeholder="Describe this configuration’s equipment"
                      onChange={(event) =>
                        update(index, {
                          builds: group.builds.map((existing, at) =>
                            at === buildIndex ? { ...existing, equipment: event.target.value } : existing,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              ))}
              {group.state !== 'fixed' && group.builds.length < 20 ? (
                <Button variant="outline" size="sm" onClick={() => update(index, { builds: [...group.builds, draftBuild(entry.entryId)] })}>
                  <Plus /> Add alternative build
                </Button>
              ) : null}
              <p className="text-xs text-dim">
                {group.state === 'unbuilt'
                  ? 'Possible builds after assembly; these models are not ready to field.'
                  : group.state === 'interchangeable'
                    ? 'The same models can switch between these configurations, but cannot supply both at once.'
                    : 'Only the assembled configuration is recorded.'}
              </p>
            </fieldset>
          ))}
          {groups.length < 50 ? (
            <Button
              variant="outline"
              onClick={() => setGroups((current) => [...current, draftGroup(entry.entryId)])}
              disabled={save.isPending}
            >
              <Plus /> Add model group
            </Button>
          ) : null}
          <output className="block text-sm text-bone">
            {total} physical {total === 1 ? 'model' : 'models'} in total. Saving replaces the count of {entry.models}.
          </output>
          {problem || save.error ? (
            <p role="alert" className="text-sm text-destructive">
              {problem ?? errorMessage(save.error)}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {entry.groups ? (
            <Button variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
              Keep count only
            </Button>
          ) : null}
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => {
              const result = collectionGroupsSchema.safeParse(groups)
              if (!result.success) {
                setProblem(result.error.issues[0]?.message ?? 'Check model groups.')
                return
              }
              setProblem(null)
              save.mutate(result.data)
            }}
          >
            {save.isPending ? 'Saving…' : 'Save model groups'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
