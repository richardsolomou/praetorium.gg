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
})
