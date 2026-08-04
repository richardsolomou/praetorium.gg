import { describe, expect, it } from 'vitest'
import { attachmentOf } from './attach'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'

const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: 'pts', name: 'pts' }] } }

const indexOf = (catalogue: Partial<Catalogue>) =>
  buildIndex([system, { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }], 'test-revision')

const ability = (name: string, text: string) => ({ id: `${name}-profile`, name, characteristics: [{ name: 'Description', $text: text }] })

describe('a character that can join a unit', () => {
  it('is a leader when the ability is titled Leader', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'overlord',
          name: 'Overlord',
          type: 'model',
          infoGroups: [
            {
              id: 'g',
              name: 'Leader',
              profiles: [ability('Leader', 'This model can be attached to the following units:\n■ IMMORTALS\n■ LYCHGUARD')],
            },
          ],
        },
      ],
    })
    expect(attachmentOf(index.definitions.get('overlord')!, index)).toEqual({ kind: 'leader', targets: ['IMMORTALS', 'LYCHGUARD'] })
  })

  it('is supporting when the ability is titled after the model', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'plasmancer',
          name: 'Plasmancer',
          type: 'model',
          profiles: [ability('Plasmancer', 'This model can be attached to the following units:\n■ IMMORTALS')],
        },
      ],
    })
    expect(attachmentOf(index.definitions.get('plasmancer')!, index)).toEqual({ kind: 'support', targets: ['IMMORTALS'] })
  })

  it('reads the comma-separated form the data also uses', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'geomancer',
          name: 'Geomancer',
          type: 'model',
          profiles: [
            ability(
              'Geomancer',
              'This model can be attached to the following units: ^^**Canoptek Macrocytes, Immortals, Necron Warriors**^^',
            ),
          ],
        },
      ],
    })
    expect(attachmentOf(index.definitions.get('geomancer')!, index)?.targets).toEqual([
      'Canoptek Macrocytes',
      'Immortals',
      'Necron Warriors',
    ])
  })

  it('reads an ability the entry links to rather than holds', () => {
    const index = indexOf({
      sharedInfoGroups: [
        {
          id: 'shared-leader',
          name: 'Leader',
          profiles: [ability('Leader', 'This model can be attached to the following units:\n■ IMMORTALS')],
        },
      ],
      sharedSelectionEntries: [{ id: 'lord', name: 'Lord', type: 'model', infoLinks: [{ id: 'l', targetId: 'shared-leader' }] }],
    })
    expect(attachmentOf(index.definitions.get('lord')!, index)?.targets).toEqual(['IMMORTALS'])
  })

  it('is nothing at all for a character whose ability says no such thing', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'trazyn',
          name: 'Trazyn',
          type: 'model',
          profiles: [ability('Trazyn', 'Once per battle, this model may do something else entirely.')],
        },
      ],
    })
    expect(attachmentOf(index.definitions.get('trazyn')!, index)).toBeNull()
  })

  it('is nothing when the claim is made but no unit is named', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        { id: 'vague', name: 'Vague', type: 'model', profiles: [ability('Vague', 'This model can be attached to the following units:')] },
      ],
    })
    expect(attachmentOf(index.definitions.get('vague')!, index)).toBeNull()
  })
})
