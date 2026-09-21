import { describe, expect, it } from 'vitest'
import { bookOf } from './catalogue.fixtures'
import type { LoadedRules } from './rules'
import { rosterTelemetryProperties } from './rosterTelemetry'

const loaded = bookOf({
  name: 'Death Guard',
  sharedSelectionEntries: [
    {
      id: 'wrapper',
      name: 'Detachment',
      type: 'upgrade',
      selectionEntryGroups: [
        {
          id: 'choices',
          name: 'Detachment',
          selectionEntries: [
            { id: 'plague-host', name: 'Plague Host', type: 'upgrade' },
            { id: 'virulent-vectorium', name: 'Virulent Vectorium', type: 'upgrade' },
          ],
        },
      ],
    },
  ],
})

const rules = {
  factionKeys: new Map([['death-guard', 'death-guard']]),
  factionNames: new Map(),
  byDetachment: new Map([['death-guard', new Map([['plague-host', []]])]]),
} as Partial<LoadedRules> as LoadedRules

describe('roster telemetry properties', () => {
  it('uses normalized source names and reports complete rule coverage', () => {
    expect(rosterTelemetryProperties({ catalogueId: 'cat', detachmentIds: ['plague-host'], limit: 2_000 }, loaded, rules)).toEqual({
      faction: 'death-guard',
      detachment: 'plague-host',
      detachment_count: 1,
      detachment_rules_covered: true,
      limit: 2_000,
    })
  })

  it('reports a deterministic combination when one selected detachment lacks rules', () => {
    expect(
      rosterTelemetryProperties({ catalogueId: 'cat', detachmentIds: ['virulent-vectorium', 'plague-host'], limit: 3_000 }, loaded, rules),
    ).toEqual({
      faction: 'death-guard',
      detachment: 'plague-host|virulent-vectorium',
      detachment_count: 2,
      detachment_rules_covered: false,
      limit: 3_000,
    })
  })

  it('does not report rule coverage when no detachment is selected', () => {
    expect(rosterTelemetryProperties({ catalogueId: 'cat', detachmentIds: [], limit: 1_000 }, loaded, rules)).toEqual({
      faction: 'death-guard',
      detachment: 'none',
      detachment_count: 0,
      limit: 1_000,
    })
  })

  it('reports missing catalogue detachments as uncovered', () => {
    expect(rosterTelemetryProperties({ catalogueId: 'cat', detachmentIds: ['missing'], limit: 2_000 }, loaded, rules)).toEqual({
      faction: 'death-guard',
      detachment: 'none',
      detachment_count: 0,
      detachment_rules_covered: false,
      limit: 2_000,
    })
  })

  it('keeps the battle size when catalogue data is unavailable', () => {
    expect(rosterTelemetryProperties({ catalogueId: 'cat', detachmentIds: ['plague-host'], limit: 2_000 }, null, rules)).toEqual({
      limit: 2_000,
    })
  })
})
