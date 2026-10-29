import { useMutation } from '@tanstack/react-query'
import { Copy, LoaderCircle, Search, TriangleAlert } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Problem } from '../../components/Problem'
import { findImportableRosters } from '../../functions'
import { countLabel } from '../../text'
import type { MatchedImport } from './RosterImport'

type Found = Extract<Awaited<ReturnType<typeof findImportableRosters>>, { found: true }>['rosters'][number]
export type RosterApp = 'battlebase' | 'newrecruit'

const matched = (found: Found): found is Extract<Found, { kind: 'read' }> & { imported: MatchedImport } =>
  found.kind === 'read' && Boolean(found.imported.catalogueId && found.imported.source)
const complete = (imported: MatchedImport) => !imported.unknown.length && !imported.unplaced.length

/**
 * Lists another app holds, found by player or by link and read the way pasted text is. A list that
 * matched completely can be imported with others in one go; any other opens the usual review first.
 * `onImport` saves the chosen lists, or is absent where only one list may be kept, as for a visitor.
 */
export function RosterAppImport({
  app,
  working,
  onReview,
  onImport,
}: {
  app: RosterApp
  working: boolean
  onReview: (imported: MatchedImport) => void
  onImport?: (imported: readonly MatchedImport[]) => void
}) {
  const [username, setUsername] = useState('')
  const [links, setLinks] = useState('')
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const find = useMutation({
    mutationFn: () =>
      findImportableRosters({
        data:
          app === 'battlebase'
            ? { source: 'battlebase', username: username.trim() }
            : { source: 'newrecruit', links: links.split(/\s+/).filter(Boolean).slice(0, 20) },
      }),
    onSuccess: (result) => {
      posthog.capture('roster_app_import_found', {
        source: app,
        found: result.found,
        rosters: result.found ? result.rosters.length : 0,
        complete: result.found ? result.rosters.filter((found) => matched(found) && complete(found.imported)).length : 0,
      })
      if (result.found)
        setChosen(new Set(result.rosters.filter((found) => matched(found) && complete(found.imported)).map((found) => found.key)))
    },
  })
  const restart = () => {
    find.reset()
    setChosen(new Set())
  }
  const rosters = find.data?.found ? find.data.rosters : null
  const picked =
    rosters?.filter((found) => matched(found) && chosen.has(found.key)).map((found) => (found as { imported: MatchedImport }).imported) ??
    []

  return (
    <div className="space-y-3">
      <form
        className="space-y-1"
        onSubmit={(event) => {
          event.preventDefault()
          find.mutate()
        }}
      >
        {app === 'battlebase' ? (
          <>
            <Label htmlFor="import-battlebase-player">BattleBase username</Label>
            <div className="flex gap-2">
              <Input
                id="import-battlebase-player"
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
              <Button type="submit" className="h-11" disabled={!username.trim() || find.isPending || working}>
                {find.isPending ? <LoaderCircle className="animate-spin" /> : <Search />} Find
              </Button>
            </div>
            <p className="text-xs text-dim">Anyone’s public rosters, yours or another player’s.</p>
          </>
        ) : (
          <>
            <Label htmlFor="import-newrecruit-links">New Recruit share links, one per line</Label>
            <Textarea
              id="import-newrecruit-links"
              value={links}
              rows={3}
              maxLength={4_000}
              placeholder="https://www.newrecruit.eu/app/list/…"
              className="font-mono text-xs"
              onChange={(event) => {
                setLinks(event.target.value)
                restart()
              }}
            />
            <Button type="submit" className="w-full" disabled={!links.trim() || find.isPending || working}>
              {find.isPending ? <LoaderCircle className="animate-spin" /> : <Search />} Find lists
            </Button>
          </>
        )}
      </form>
      {find.error ? <Problem error={find.error} /> : null}
      {find.data && !find.data.found ? <Problem>No BattleBase player is called {username.trim()}.</Problem> : null}
      {rosters && !rosters.length ? <p className="text-sm text-dim">{username.trim()} has no public rosters.</p> : null}
      {rosters?.length ? (
        <ul className="space-y-1.5" aria-label="Lists found">
          {rosters.map((found) => {
            if (!matched(found))
              return (
                <li key={found.key} className="flex items-start gap-2 border border-edge bg-sunken p-3 text-sm text-dim">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-discarded" aria-hidden />
                  <span>
                    {found.kind === 'read'
                      ? `${found.imported.name}: ${found.imported.unknown[0]?.reason ?? 'its army was not recognised'}`
                      : found.problem}
                  </span>
                </li>
              )
            const { imported } = found
            const whole = complete(imported)
            const id = `import-app-${found.key}`
            return (
              <li key={found.key} className="flex items-center gap-3 border border-edge bg-sunken p-3">
                {onImport && whole ? (
                  <input
                    id={id}
                    type="checkbox"
                    className="size-5 shrink-0 accent-parchment"
                    checked={chosen.has(found.key)}
                    disabled={working}
                    onChange={(event) =>
                      setChosen((current) => {
                        const next = new Set(current)
                        if (event.target.checked) next.add(found.key)
                        else next.delete(found.key)
                        return next
                      })
                    }
                  />
                ) : null}
                <label htmlFor={onImport && whole ? id : undefined} className="min-w-0 flex-1 text-sm">
                  <span className="block truncate font-semibold">{imported.name}</span>
                  <span className="block text-xs text-dim">
                    {imported.catalogueName?.split(' - ').at(-1)} · {imported.units.length} of{' '}
                    {countLabel(imported.sourceUnitCount, 'entry', 'entries')}
                    {imported.currentPoints === null ? '' : ` · ${imported.currentPoints} points`}
                  </span>
                  {whole ? null : (
                    <span className="block text-xs text-discarded">
                      {countLabel(imported.unknown.length + imported.unplaced.length, 'thing')} to check before importing
                    </span>
                  )}
                </label>
                {!onImport || !whole ? (
                  <Button size="sm" variant="outline" disabled={working} onClick={() => onReview(imported)}>
                    Review
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {onImport && rosters?.length ? (
        <Button className="w-full" disabled={!picked.length || working} onClick={() => onImport(picked)}>
          {working ? <LoaderCircle className="animate-spin" /> : <Copy />}
          {picked.length ? `Import ${countLabel(picked.length, 'roster')}` : 'Choose rosters to import'}
        </Button>
      ) : null}
    </div>
  )
}
