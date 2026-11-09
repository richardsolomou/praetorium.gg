import { describe, expect, it } from 'vitest'
import { fromWarscribeText, isWarscribeLink } from './warscribe'

const gw = `Sanitised (520 Points)

Necrons
Cursed Legion and Skyshroud Spearhead (3 Detachment Points)
Strike Force (2,000 Points)

ATTACHED UNITS

Attached unit 1

Overlord (110 Points)
• Attached as: Leader (Character)
• Warlord
• Enhancements: Destroyer Ankh
• 1x Tachyon arrow

Immortals (65 Points)
• Attached as: Bodyguard (Battleline)
• 5x Immortal
◦ 5x Gauss blaster

Data: v995
Created with Warscribe
40k.warscribe.app`

const compact = `Sanitised (520 Points)

+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Necrons
+ DETACHMENT: Cursed Legion and Skyshroud Spearhead
+ BATTLE SIZE: Strike Force
+ TOTAL ARMY POINTS: 520pts
+ NUMBER OF UNITS: 2
+++++++++++++++++++++++++++++++++++++++++++++++

Char1: 1x Overlord (90 pts): Tachyon arrow, Warlord
Enhancement: Destroyer Ankh (+20 pts)
Leading: Immortals

5x Immortals (65 pts): 5x Gauss blaster, 5x Close combat weapon [Led by: Overlord]

Data: v995
Created with Warscribe
40k.warscribe.app`

const framed = `════════════════════
Xenos - Necrons
Cursed Legion (2 DP) · Skyshroud Spearhead (1 DP)
155 / 2000 pts · 2 units
Warlord: Overlord
════════════════════

CHARACTERS ·········· 90
  Overlord ·········· 90  ★ Warlord
      Tachyon arrow, Overlord’s blade
      Leading: Immortals

BATTLELINE ·········· 65
  Immortals (5 models) ·· 65
      5x Gauss blaster, 5x Close combat weapon

────────────────────
TOTAL 155 / 2000 pts
App: v2026.10.02 | Data: v995
Created with Warscribe: 40K
https://40k.warscribe.app/`

const bulleted = `Sanitised (155 points)

Necrons
Strike Force (2000 points)
Cursed Legion and Skyshroud Spearhead (3 Detachment Points)
Force Dispositions: Purge the Foe

CHARACTERS
Overlord (90 points)
• Warlord
• Leading: Immortals
• 1x Tachyon arrow, 1x Overlord’s blade

BATTLELINE
Immortals (65 points) [5 models]
• 5x Gauss blaster, 5x Close combat weapon

App: v2026.10.02 | Data: v995
Created with Warscribe: 40K
https://40k.warscribe.app/`

const overlord = { name: 'Overlord', leading: 'Immortals', warlord: true, models: 1 }
const immortals = {
  name: 'Immortals',
  models: 5,
  selections: [
    { name: 'Gauss blaster', count: 5 },
    { name: 'Close combat weapon', count: 5 },
  ],
}

describe('Warscribe text import', () => {
  it.each([
    [' https://40k.warscribe.app/l#Pc7BboMw ', true],
    ['https://40k.warscribe.app/build/4b475aa8-8e10-4458-a4fd-ac29c30c9958', true],
    [gw, false],
  ])('tells a link to the site from a list that mentions it', (input, link) => {
    expect(isWarscribeLink(input)).toBe(link)
  })

  it('leaves other exports to their own readers', () => {
    expect(fromWarscribeText(gw.replace('Created with Warscribe', ''))).toBeNull()
  })

  it('reads the official-app layout without its footer', () => {
    const parsed = fromWarscribeText(gw)!
    expect(parsed).toMatchObject({ name: 'Sanitised', limit: 2000, dataVersion: 995 })
    expect(parsed.units.at(-1)!.unread).toBeUndefined()
  })

  it('reads a Discord code block', () => {
    expect(fromWarscribeText(`\`\`\`\n${compact}\n\`\`\``)!.units.at(-1)!.unread).toBeUndefined()
  })

  it('reads the compact layout and its leader lines', () => {
    expect(fromWarscribeText(compact)).toMatchObject({
      name: 'Sanitised',
      limit: 2000,
      sizeName: 'Strike Force',
      units: [{ name: 'Overlord', leading: 'Immortals', warlord: true }, immortals],
    })
  })

  it('takes a chapter as the faction of the compact layout', () => {
    expect(fromWarscribeText(compact.replace('+ DETACHMENT', '+ CHAPTER: Deathwatch\n+ DETACHMENT'))?.faction).toBe('Deathwatch')
  })

  it('keeps a comma inside a weapon note', () => {
    const units = fromWarscribeText(compact.replace('Tachyon arrow', 'Pulsa Rokkit (Once per battle, per unit)'))?.units
    expect(units?.[0]?.selections.map((selection) => selection.name)).toContain('Pulsa Rokkit (Once per battle, per unit)')
  })

  it("counts the models of each kind and keeps only a lone model's line", () => {
    const unit = fromWarscribeText(gw.replace('• 5x Immortal', '• 1x Specialist\n◦ 1x Blade\n• 4x Immortal'))?.units[1]
    expect([unit?.models, unit?.selections.map((selection) => selection.name)]).toEqual([5, ['Specialist', 'Blade', 'Gauss blaster']])
  })

  it('keeps every weapon of a list with no nested lines', () => {
    const flat = gw
      .replace('• 5x Immortal\n◦ 5x Gauss blaster', '• 1x Gauss blaster')
      .replace('• 1x Tachyon arrow', '• 1x Staff\n• 2x Tachyon arrow\n• 1x Haft')
    const unit = fromWarscribeText(flat)?.units[0]
    expect([unit?.models, unit?.selections.map((selection) => selection.name)]).toEqual([
      1,
      ['Enhancements: Destroyer Ankh', 'Staff', 'Tachyon arrow', 'Haft'],
    ])
  })

  it('reads uneven weapon counts as a lone model holding two', () => {
    const unit = fromWarscribeText(gw.replace('• 1x Tachyon arrow', '• 2x Tachyon arrow\n• 1x Staff'))?.units[0]
    expect(unit?.models).toBe(1)
  })

  it('reads the framed layout', () => {
    expect(fromWarscribeText(framed)).toMatchObject({
      faction: 'Xenos - Necrons',
      detachment: 'Cursed Legion, Skyshroud Spearhead',
      reportedPoints: 155,
      limit: 2000,
      dataVersion: 995,
      units: [overlord, immortals],
    })
  })

  it('reads the bulleted layout', () => {
    expect(fromWarscribeText(bulleted)).toMatchObject({
      name: 'Sanitised',
      faction: 'Necrons',
      detachment: 'Cursed Legion and Skyshroud Spearhead',
      disposition: 'Purge the Foe',
      sizeName: 'Strike Force',
      limit: 2000,
      units: [overlord, immortals],
    })
  })
})
