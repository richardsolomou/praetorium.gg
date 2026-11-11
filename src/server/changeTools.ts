import { z } from 'zod'
import { READ_ONLY_TOOL, structured, type AgentTools } from './agentTools'
import type { IndexedUpdate } from '../contracts/catalogueChanges'
import { changeLogPage, referencePath } from './catalogueChangeLog'

/** How many changes each faction an update reached recorded, which is all an unscoped page carries: one update across every army can run past 100 KB. */
function factionCounts(groups: IndexedUpdate['groups']) {
  const counts = new Map<string, { name: string; slug: string | null; changes: number }>()
  for (const { factions, changes } of groups)
    for (const { catalogueId, faction, slug } of factions) {
      const count = counts.get(catalogueId) ?? { name: faction, slug, changes: 0 }
      count.changes += changes.length
      counts.set(catalogueId, count)
    }
  return [...counts.values()]
}

export function registerChangeTools(server: AgentTools) {
  server.registerTool(
    'list_data_updates',
    {
      title: 'List game-data updates',
      description:
        "Lists the points and datasheet updates the installed army data recorded, newest first, as the /data-updates pages show them. Each update has its UTC time, url, total change count and omitted (changes past its stored bound). Without faction, each update lists only the factions it reached with their change counts. With faction, it lists that faction's changes in groups: kind (datasheet-points, datasheet-added, datasheet-removed, detachment-points, detachment-added, detachment-removed, enhancement-points, enhancement-added, enhancement-removed), name, points from and to (per models row for datasheets; null where none), and the url of the page describing it now, or null when it no longer exists. Pass older as before for the next page; null means no older updates.",
      inputSchema: {
        faction: z
          .string()
          .max(200)
          .optional()
          .describe('A faction slug from list_factions, such as necrons, to list only the updates that reached that faction.'),
        before: z.string().max(4096).optional().describe('The older cursor from a previous page; omit for the newest updates.'),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ faction, before }) => {
      const { updates, older } = await changeLogPage({ faction, before })
      const page = `/data-updates${faction ? `/${encodeURIComponent(faction)}` : ''}${before ? `?before=${encodeURIComponent(before)}` : ''}`
      return structured({
        updates: updates.map(({ anchor, recordedAt, total, omitted, groups }) => ({
          recordedAt: new Date(recordedAt).toISOString(),
          url: `${page}#${anchor}`,
          total,
          omitted,
          ...(faction
            ? {
                groups: groups.map(({ factions, changes }) => ({
                  factions: factions.map(({ faction: name, slug }) => ({ name, slug })),
                  changes: changes.map(({ link, ...change }) => ({ ...change, url: link ? referencePath(link) : null })),
                })),
              }
            : { factions: factionCounts(groups) }),
        })),
        older,
      })
    },
  )
}
