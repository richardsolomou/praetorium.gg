import type { CatalogueEdition } from '../core/catalogueEdition'
import { saveRosterSchema } from '../contracts/schemas'
import { bookOf, points } from './catalogue.fixtures'

export function sealedEventRosterFixture(status: CatalogueEdition['status']) {
  const edition = { id: 'codex', name: 'Test codex', status }
  const saved = {
    id: 'roster',
    ...saveRosterSchema.parse({
      name: 'Army',
      catalogueId: 'codex~cat',
      detachmentIds: [],
      disposition: null,
      limit: 1000,
      picks: [{ entryId: 'captain', toggles: { warlord: 1 } }],
      prep: null,
      waivedRules: [],
    }),
  }
  const catalogue = {
    ...bookOf({
      id: saved.catalogueId,
      selectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'unit',
          costs: points(100),
          selectionEntries: [{ id: 'warlord', name: 'Warlord', type: 'upgrade' }],
        },
      ],
    }),
    edition,
  }
  const rules = {
    factionKeys: new Map(),
    detachmentReferences: new Map(),
    detachmentDetails: new Map(),
    factionRestrictions: new Map(),
  }
  return { saved, catalogue, rules, edition }
}
