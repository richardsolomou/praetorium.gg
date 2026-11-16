import { describe, expect, it } from 'vitest'
import { fromMiniHeadquartersText } from './miniHeadquarters'

// Shortened from lists published for French events, with the player's name replaced.
const exported = `+++++++++++++++++++++++++++++++++++++++++++++++
Nom du joueur : Joueur
Nom de l'équipe :
Factions utilisées : Blood Angels
Points d'armée : 2000
Améliorations d'armée : [BA] Capitaine des Blood Angels : Guerrier animé par la Rage
Disposition : Prendre et tenir
+++++++++++++++++++++++++++++++++++++++++++++++
Détachements :
Blood Angels - Groupe d'Assaut Liberator
Blood Angels - Ost des Anges
+++++++++++++++++++++++++++++++++++++++++++++++

Ligne 1 : 5 Escouade d'assaut Intercessor [80pts] 4 Pistolet bolter Lourd, 4 Epée tronçonneuse Astartes
--- Sergent Intercessor d'Assaut,Pistolet à plasma, Gantelet énergétique
|	Personnages 1 : [Meneur] Judicateur [55pts] Pistolet bolter Absolvor, Lame Relique d'Exécuteur
Ligne 2 : 10 Escouade d'assaut Intercessor [150pts]
9 Pistolet bolter Lourd (0), 9 Epée tronçonneuse Astartes (0
--- Sergent Intercessor d'Assaut,Pistolet à plasma, Gantelet énergétique
|	Personnages 2 : [Meneur] Capitaine des Blood Angels [115pts] [Seigneur de guerre] Pistolet Inferno, Gantelet énergétique
|	--- Optimisations : Guerrier animé par la Rage (15)
|	Personnages 3 : [Appui] Prêtre Sanguinien [75pts] Pistolet bolter Absolvor, Epée tronçonneuse Astartes
------------------------------------------------------------------------------------------
Véhicules 1 : Repulsor [170pts] Bordée défensive Repulsor, Missile Hunter-slayer
`

describe('Mini Headquarters text import', () => {
  const parsed = fromMiniHeadquartersText(exported)

  it('reads the list setup', () => {
    expect(parsed).toMatchObject({
      faction: 'Blood Angels',
      detachment: "Groupe d'Assaut Liberator, Ost des Anges",
      disposition: 'Prendre et tenir',
      limit: 2000,
    })
  })

  it('reads each unit with its size', () => {
    expect(parsed?.units.map(({ name, models }) => [name, models ?? null])).toEqual([
      ["Escouade d'assaut Intercessor", 5],
      ['Judicateur', null],
      ["Escouade d'assaut Intercessor", 10],
      ['Capitaine des Blood Angels', null],
      ['Prêtre Sanguinien', null],
      ['Repulsor', null],
    ])
  })

  it('attaches each indented character to the unit above it', () => {
    const units = parsed!.units
    expect(units.map((unit) => unit.attachedToEntry ?? null)).toEqual([null, units[0]!.entry, null, units[2]!.entry, units[2]!.entry, null])
  })

  it('reads the Warlord', () => {
    expect(parsed?.units.filter((unit) => unit.warlord).map((unit) => unit.name)).toEqual(['Capitaine des Blood Angels'])
  })

  it('reads a Warlord marked before the cost, and keeps the mark out of the name', () => {
    const marked = fromMiniHeadquartersText(exported.replace('Repulsor [170pts]', 'Repulsor (seigneur de guerre) [170pts]'))
    expect(marked?.units.filter((unit) => unit.warlord).map((unit) => unit.name)).toEqual(['Capitaine des Blood Angels', 'Repulsor'])
  })

  it('reads an enhancement without its cost', () => {
    expect(parsed?.units[3]!.selections).toContainEqual({ name: 'Enhancements: Guerrier animé par la Rage', count: 1 })
  })

  it('reads wargear on the line below its unit, with costs and a cut-off cost dropped', () => {
    expect(parsed?.units[2]!.selections.slice(0, 2)).toEqual([
      { name: 'Pistolet bolter Lourd', count: 9 },
      { name: 'Epée tronçonneuse Astartes', count: 9 },
    ])
  })

  it("reads a sergeant's wargear as the sergeant's", () => {
    expect(parsed?.units[0]!.selections).toContainEqual({ name: 'Pistolet à plasma', count: 1, model: "Sergent Intercessor d'Assaut" })
  })

  it('reads the army points as the battle size they fit, not as the size itself', () => {
    const under = fromMiniHeadquartersText(exported.replace("Points d'armée : 2000", "Points d'armée : 1995"))
    expect([under?.limit, under?.reportedPoints]).toEqual([2000, 1995])
  })

  it('stops the detachments at the next labelled line and drops their costs', () => {
    const later = fromMiniHeadquartersText(
      exported
        .replace('Disposition : Prendre et tenir\n', '')
        .replace('Blood Angels - Ost des Anges', 'et Ost des Anges (1)\nDisposition : Prendre et tenir'),
    )
    expect(later?.detachment).toBe("Groupe d'Assaut Liberator, Ost des Anges")
  })

  it('reads a counted model line without its dashes as that model with its wargear', () => {
    const models = fromMiniHeadquartersText(
      exported.replace('Véhicules 1 : Repulsor', '1 Long Piquant,Fusil Kroot\nVéhicules 1 : Repulsor'),
    )
    expect(models?.units[4]!.selections.slice(-2)).toEqual([
      { name: 'Long Piquant', count: 1 },
      { name: 'Fusil Kroot', count: 1, model: 'Long Piquant' },
    ])
  })

  it('reads nothing that is not its layout', () => {
    expect(fromMiniHeadquartersText('Blood Angels\nStrike Force (2000 points)')).toBeNull()
  })
})
