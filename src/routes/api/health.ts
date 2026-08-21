import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { databaseHealthFailure } from 'ras-stack/server'
import { tanStackHealthHandler } from 'ras-stack/tanstack/server'
import { valkeyReachable } from '../../adapters/valkey'
import { app } from '../../server/app'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: tanStackHealthHandler(
        async () => {
          await app().ready()
          const instance = app()
          // Both stores, because a replica that cannot reach Valkey cannot hear
          // another replica's commands and should not be sent traffic.
          await Promise.all([
            instance.database.execute(sql`select 1`),
            instance.valkey ? valkeyReachable(instance.valkey) : Promise.resolve(true),
          ])
        },
        { failure: databaseHealthFailure },
      ),
    },
  },
})
