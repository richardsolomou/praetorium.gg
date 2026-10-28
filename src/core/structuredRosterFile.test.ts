import { describe, expect, it } from 'vitest'
import { structuredRosterFile } from './structuredRosterFile'

describe('structuredRosterFile', () => {
  it('reads BattleScribe roster XML as .ros', () => {
    expect(
      structuredRosterFile(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<roster id="a" name="List" xmlns="http://www.battlescribe.net/schema/rosterSchema">',
      ),
    ).toBe('ros')
  })

  it('reads zip bytes as .rosz', () => {
    expect(structuredRosterFile('PK\u0003\u0004\u0014\u0000')).toBe('rosz')
  })

  it('reads a pasted or dropped file name by its extension', () => {
    expect(structuredRosterFile(' My Army.Regiztry\n')).toBe('regiztry')
  })

  it('leaves a text export that mentions a .ros file alone', () => {
    expect(structuredRosterFile('Army (2000 Points)\n\nConverted from army.ros')).toBeNull()
  })
})
