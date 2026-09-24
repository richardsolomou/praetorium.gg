import { desc, gt } from 'drizzle-orm'
import { type CatalogueChangeSet, catalogueChangeSetSchema } from '../../core/catalogueChanges'
import type { PraetoriumDatabase } from '../connection'
import { catalogueChanges } from '../schema'

export type RecordedCatalogueChanges = { fromSnapshot: string; toSnapshot: string; recordedAt: number; changes: CatalogueChangeSet }

const read = (row: typeof catalogueChanges.$inferSelect): RecordedCatalogueChanges => ({
  fromSnapshot: row.fromSnapshot,
  toSnapshot: row.toSnapshot,
  recordedAt: row.recordedAt,
  changes: catalogueChangeSetSchema.parse(JSON.parse(row.body)),
})

export class CatalogueChangeRepository {
  constructor(private readonly database: PraetoriumDatabase) {}

  /** Whether this call stored the pair. A replica that swapped second finds it stored already. */
  async recordCatalogueChanges(input: { fromSnapshot: string; toSnapshot: string; recordedAt: number; changes: CatalogueChangeSet }) {
    const inserted = await this.database
      .insert(catalogueChanges)
      .values({
        fromSnapshot: input.fromSnapshot,
        toSnapshot: input.toSnapshot,
        recordedAt: input.recordedAt,
        body: JSON.stringify(input.changes),
      })
      .onConflictDoNothing()
      .returning({ fromSnapshot: catalogueChanges.fromSnapshot })
    return inserted.length > 0
  }

  /** The newest change sets first, recorded after `after` when it is given. */
  async catalogueChanges(limit: number, after?: number) {
    const rows = await this.database
      .select()
      .from(catalogueChanges)
      .where(after === undefined ? undefined : gt(catalogueChanges.recordedAt, after))
      .orderBy(desc(catalogueChanges.recordedAt), desc(catalogueChanges.toSnapshot))
      .limit(limit)
    return rows.map(read)
  }
}
