import { expect, it } from 'vitest'
import { fromNewRecruitMarkdown } from './newRecruitMarkdown'

const markdown = `Xenos - Orks - Maximas Matanzas - [275 pts]

# ++ Army Roster ++ [275 pts, 2 Detachment Points]
## Configuration
Battle Size: Strike Force (2000 Point limit)
Detachment [2 Detachment Points]: Dread Mob [1 Detachment Points], Wreckas [1 Detachment Points]
Force Disposition: Purge the Foe
Show/Hide Options

## Character [45 pts]
Mek [45 pts]: Kustom Mega-slugga, Mek's Toolz
  • Supporting: Flash Gitz[1]

## Infantry [230 pts]
Flash Gitz [230 pts]: Supa-snazz Dakka [20 pts]
• 1x Kaptin: Choppa, Snazzgun
• 9x Flash Gitz: Choppa, Snazzgun
  • Supported by: Mek[1]`

it('reads the setup and units of a New Recruit Markdown export', () => {
  const parsed = fromNewRecruitMarkdown(markdown)

  expect({
    name: parsed?.name,
    faction: parsed?.faction,
    detachment: parsed?.detachment,
    disposition: parsed?.disposition,
    limit: parsed?.limit,
    units: parsed?.units.map(({ name, models, leading }) => ({ name, models, leading })),
  }).toEqual({
    name: 'Maximas Matanzas',
    faction: 'Xenos - Orks',
    detachment: 'Dread Mob, Wreckas',
    disposition: 'Purge the Foe',
    limit: 2000,
    units: [
      { name: 'Mek', models: 1, leading: 'Flash Gitz' },
      { name: 'Flash Gitz', models: 10, leading: null },
    ],
  })
})
