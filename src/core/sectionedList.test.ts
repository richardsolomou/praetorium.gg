import { describe, expect, it } from 'vitest'
import { fromSectionedListText } from './sectionedList'

// Shortened from lists published for French events.
const exported = `Adeptus Custodes : Liste du tournoi

### Détachements :
* Adeptus Custodes - Lions de l'Empereur
* Adeptus Custodes - Puissance des Moritoi
=> Disposition : Prendre et tenir

	--- Infanterie ---

Custodiens Allarus (3) : 165 pts

	| [Meneur] Capitaine-Rempart en Armure Terminator Allarus  : 150 pts
	| - [Lions de l'Empereur] Admonimortis

Veilleurs Custodiens (5) : 260 pts(+20)
- Vexilla
- Doctrine Devastator : Peut tirer après avoir Avancé

	| [Meneur] Champion des Lames  : 135 pts(+15)
Seigneur de guerre

	--- Montés ---

[Seigneur de guerre] Tétrarque  : 85 pts
- Arbalète à tachyons, Lame de Tétrarque

Exo-armures Stealth (5) : 100 pts
- Long Piquant :  Fusil Kroot, Pistolet Kroot

Total : 990 points - 36 figurines - 10 unités
`

describe('sectioned list text import', () => {
  const parsed = fromSectionedListText(exported)

  it('reads the list setup', () => {
    expect(parsed).toMatchObject({
      name: 'Liste du tournoi',
      faction: 'Adeptus Custodes',
      detachment: "Lions de l'Empereur, Puissance des Moritoi",
      disposition: 'Prendre et tenir',
      limit: 1000,
      reportedPoints: 990,
    })
  })

  it('reads each unit with its size', () => {
    expect(parsed?.units.map(({ name, models }) => [name, models ?? null])).toEqual([
      ['Custodiens Allarus', 3],
      ['Capitaine-Rempart en Armure Terminator Allarus', null],
      ['Veilleurs Custodiens', 5],
      ['Champion des Lames', null],
      ['Tétrarque', null],
      ['Exo-armures Stealth', 5],
    ])
  })

  it('attaches each indented leader to the unit above it', () => {
    const units = parsed!.units
    expect([units[1]!.attachedToEntry, units[3]!.attachedToEntry]).toEqual([units[0]!.entry, units[2]!.entry])
  })

  it('reads a Warlord marked in front of a unit or on its own line', () => {
    expect(parsed?.units.filter((unit) => unit.warlord).map((unit) => unit.name)).toEqual(['Champion des Lames', 'Tétrarque'])
  })

  it("reads a leader's enhancement without the detachment it names", () => {
    expect(parsed?.units[1]!.selections).toEqual([{ name: 'Enhancements: Admonimortis', count: 1 }])
  })

  it("reads a model's own wargear as that model's", () => {
    expect(parsed?.units[5]!.selections).toContainEqual({ name: 'Fusil Kroot', count: 1, model: 'Long Piquant' })
  })

  it('keeps a rule the player noted out of the wargear', () => {
    expect(parsed?.units[2]!.selections).toEqual([{ name: 'Vexilla', count: 1 }])
  })

  it('reads nothing without its detachment heading', () => {
    expect(fromSectionedListText('Adeptus Custodes : Liste\n\nCustodiens Allarus (3) : 165 pts')).toBeNull()
  })
})
