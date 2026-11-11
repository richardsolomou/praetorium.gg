import { z } from 'zod'
import { boundedProgress, groupCollection } from '../core/collection'
import { routeSlug } from '../core/slug'
import { rosterArchiveSchema, rosterIdSchema } from '../contracts/schemas'
import { READ_ONLY_TOOL, type AgentTools } from './agentTools'
import { resultOf } from './accountMcp'
import { app } from './app'
import { rosterActions } from './rosterActions'

// More owned datasheets than this come back as faction totals, so one answer stays readable.
const COLLECTION_ENTRIES_MAX = 200

const notFound = () => new Response('You have no saved roster with this id. Use an id from list_my_rosters.', { status: 404 })

export function registerRosterAccountTools(server: AgentTools, userId: string | null) {
  const owner = () => {
    if (!userId) throw new Response('Sign in to use this tool.', { status: 401 })
    return userId
  }
  const ownRoster = async (id: string) => {
    const roster = await app().service.sealedEventService.ownRoster(owner(), id)
    if (!roster) throw notFound()
    return roster
  }

  server.registerTool(
    'delete_roster',
    {
      title: 'Delete my roster',
      description:
        "Permanently deletes one of the signed-in player's saved rosters, by an id from list_my_rosters, and ends any loan of it to a friend. Battles it was fielded in keep their own record. It cannot be undone, so confirm the roster's name with the player first; set_roster_archived hides a list without losing it. Requires mcp:write.",
      inputSchema: rosterIdSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    ({ id }) =>
      resultOf(async () => {
        const { name } = await ownRoster(id)
        await rosterActions.delete(owner(), id)
        return { id, name, deleted: true }
      }),
  )
  server.registerTool(
    'copy_roster',
    {
      title: 'Copy a roster',
      description:
        "Saves a copy of a roster to the signed-in player's account: one of their own from list_my_rosters, or a public or unlisted one they can open. variant true keeps the copy grouped with the original as an alternative version, which only works on their own rosters; false makes a standalone copy. The copy takes the player's default visibility, which is public unless they changed it, whatever the original's. Returns the new roster's id, url and visibility: tell the player when it is public, and offer set_roster_visibility. Requires mcp:write.",
      inputSchema: {
        id: rosterIdSchema.shape.id,
        variant: z.boolean().default(false).describe('Group the copy with the original as a variant; only for the player’s own rosters.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    ({ id, variant }) =>
      resultOf(async () => {
        const copied = await rosterActions.copy(owner(), { id, variant })
        return { ...copied, url: `/rosters/${encodeURIComponent(copied.id)}` }
      }),
  )
  server.registerTool(
    'set_roster_archived',
    {
      title: 'Archive or restore my roster',
      description:
        "Archives one of the signed-in player's saved rosters, which moves it out of their main roster list without deleting it, or restores it with archived false. Requires mcp:write.",
      inputSchema: rosterArchiveSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ id, archived }) =>
      resultOf(async () => {
        await rosterActions.setArchived(owner(), { id, archived })
        return { id, archived }
      }),
  )
  server.registerTool(
    'get_my_collection',
    {
      title: 'Read my model collection',
      description: `Returns the models the signed-in player owns, as their collection page keeps them, grouped by faction. Each entry's id and slug are the datasheet's, the same as list_units gives, with the models owned, how many are built and painted, and countsAs: other datasheets the player says those models can also be fielded as. A datasheet the current army data no longer has is named "A datasheet from earlier rules". Pass faction to read one army; a collection of more than ${COLLECTION_ENTRIES_MAX} datasheets without one returns only each faction's totals. Requires mcp:read.`,
      inputSchema: {
        faction: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .optional()
          .describe('Faction id, URL slug, or display name, as list_factions gives them.'),
      },
      annotations: READ_ONLY_TOOL,
    },
    ({ faction }) =>
      resultOf(async () => {
        const instance = app()
        const service = instance.service.rosterService
        const [counts, progress, countsAs, units] = await Promise.all([
          service.collectionCounts(owner()),
          service.collectionProgress(owner()),
          service.collectionCountsAs(owner()),
          instance.combatUnitsFor(),
        ])
        const names = new Map(units.flatMap((shelf) => shelf.units.map((unit) => [unit.id, unit.name] as const)))
        const entries = Object.entries(counts).map(([entryId, models]) => ({
          entryId,
          models,
          ...boundedProgress(models, progress[entryId] ?? { built: 0, painted: 0 }),
        }))
        const wanted = faction?.toLowerCase()
        const groups = groupCollection(entries, units).filter(
          (group) =>
            !wanted ||
            group.catalogueId?.toLowerCase() === wanted ||
            group.name.toLowerCase() === wanted ||
            routeSlug(group.name) === wanted,
        )
        const shown = groups.reduce((total, group) => total + group.entries.length, 0)
        const totalsOnly = !faction && shown > COLLECTION_ENTRIES_MAX
        return {
          factions: groups.map((group) => ({
            catalogueId: group.catalogueId,
            name: group.name,
            models: group.models,
            datasheets: group.entries.length,
            ...(totalsOnly
              ? {}
              : {
                  entries: group.entries.map(({ entryId, slug, name, models, built, painted }) => ({
                    id: entryId,
                    slug,
                    name,
                    models,
                    built,
                    painted,
                    countsAs: (countsAs[entryId] ?? []).map((id) => ({ id, name: names.get(id) ?? 'A datasheet from earlier rules' })),
                  })),
                }),
          })),
          ...(totalsOnly ? { note: 'Pass faction to list the datasheets of one army.' } : {}),
        }
      }),
  )
}
