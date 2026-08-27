import { describe, expect, it } from 'vitest'
import { fromBattleBaseText } from './battlebase'

const exportText = `CL 1K - Ammentar Destroyer Spearhead (990 Points)

Necrons
Cursed Legion (2 Detachment Points)
Force Dispositions: Purge the Foe
Incursion (1,000 Points)

CHARACTERS

Lokhust Lord (70 Points)
    • Leading: Lokhust Destroyers
    • Warlord
    • 1x Lord's blade
    • 1x Resurrection Orb

OTHER DATASHEETS

Lokhust Destroyers (170 Points)
    • Leader: Lokhust Lord
    • 6x Close combat weapon
    • 6x Gauss cannon

Exported with BattleBase, Data Version: v20260812`

const kingOfTheColosseumExport = `SA 500 (500 Points)

Necrons
Starshatter Arsenal (3 Detachment Points)
Force Dispositions: Priority Assets
King of the Colosseum (500 Points)

CHARACTERS

Lokhust Lord (80 Points)
    • Warlord
    • 1x Lord's blade
    • 1x Resurrection Orb
    • Enhancement: Demanding Leader

BATTLELINE

Immortals (70 Points)
    • 5x Close combat weapon
    • 5x Gauss blaster

Exported with BattleBase, Data Version: v20260812`

describe('BattleBase text import', () => {
  it('reads list setup and units', () => {
    expect(fromBattleBaseText(exportText)).toEqual({
      name: 'CL 1K - Ammentar Destroyer Spearhead',
      faction: 'Necrons',
      detachment: 'Cursed Legion',
      disposition: 'Purge the Foe',
      limit: 1000,
      units: [
        {
          name: 'Lokhust Lord',
          leading: 'Lokhust Destroyers',
          warlord: true,
          selections: [
            { name: "Lord's blade", count: 1 },
            { name: 'Resurrection Orb', count: 1 },
          ],
        },
        {
          name: 'Lokhust Destroyers',
          leading: null,
          leader: 'Lokhust Lord',
          warlord: false,
          selections: [
            { name: 'Close combat weapon', count: 6 },
            { name: 'Gauss cannon', count: 6 },
          ],
        },
      ],
    })
  })

  it('does not claim unrelated text', () => {
    expect(fromBattleBaseText('Necrons\nLokhust Lord')).toBeNull()
  })

  it('does not read a named game format as a unit', () => {
    expect(fromBattleBaseText(kingOfTheColosseumExport)?.units.map((unit) => unit.name)).toEqual(['Lokhust Lord', 'Immortals'])
  })

  it('reads support attachments', () => {
    const parsed = fromBattleBaseText(
      exportText
        .replace('Leading: Lokhust Destroyers', 'Supporting: Lokhust Destroyers')
        .replace('Leader: Lokhust Lord', 'Support: Lokhust Lord'),
    )

    expect(parsed?.units).toMatchObject([{ leading: 'Lokhust Destroyers' }, { leader: 'Lokhust Lord' }])
  })
})
