import { bookOf } from './catalogue.fixtures'

/** `armedKind` makes the armed character a Leader where a test fields it on its own, which a Support character may not be. */
export function preferenceBook(equipmentChoice = false, armedKind: 'Support' | 'Leader' = 'Support') {
  const weapon = (id: string, name: string, damage: string) => ({
    id,
    name,
    typeName: 'Ranged Weapons',
    characteristics: Object.entries({ A: '1', BS: '3+', S: '4', AP: '0', D: damage }).map(([characteristic, $text]) => ({
      name: characteristic,
      $text,
    })),
  })
  const model = (id: string, name: string, kind?: string) => ({
    id,
    name,
    type: 'model' as const,
    profiles: [
      {
        id: `${id}-stats`,
        name,
        typeName: 'Unit',
        characteristics: Object.entries({ T: '4', Sv: '3+', W: '2' }).map(([characteristic, $text]) => ({ name: characteristic, $text })),
      },
      ...(kind
        ? [
            {
              id: `${id}-attachment`,
              name: kind,
              typeName: 'Abilities',
              characteristics: [{ name: 'Description', $text: 'This model can be attached to the following units:\n■ Squad' }],
            },
          ]
        : []),
    ],
  })
  return bookOf({
    selectionEntries: [
      model('squad', 'Squad'),
      model('leader', 'Leader', 'Leader'),
      {
        ...model('support', 'Support', armedKind),
        profiles: [
          ...model('support', 'Support', armedKind).profiles,
          ...(equipmentChoice
            ? []
            : [weapon('support-focused', 'Plasma - focused', '1'), weapon('support-spread', 'Plasma - spread', '3')]),
        ],
        ...(equipmentChoice
          ? {
              selectionEntryGroups: [
                {
                  id: 'support-weapon',
                  name: 'Support weapon',
                  defaultSelectionEntryId: 'staff',
                  constraints: [
                    { id: 'support-weapon-min', type: 'min' as const, value: 1, field: 'selections', scope: 'parent' },
                    { id: 'support-weapon-max', type: 'max' as const, value: 1, field: 'selections', scope: 'parent' },
                  ],
                  selectionEntries: [
                    { id: 'staff', name: 'Staff', type: 'upgrade' as const, profiles: [weapon('support-staff', 'Staff', '1')] },
                    {
                      id: 'plasma',
                      name: 'Plasma',
                      type: 'upgrade' as const,
                      profiles: [weapon('support-focused', 'Plasma - focused', '1'), weapon('support-spread', 'Plasma - spread', '3')],
                    },
                  ],
                },
              ],
            }
          : {}),
      },
    ],
  })
}
