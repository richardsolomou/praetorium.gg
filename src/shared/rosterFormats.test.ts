import { expect, it } from 'vitest'
import { importRosterFormat } from './rosterFiles'

// Earlier readers claim loose layouts, so each new one is checked to reach its own reader.
it("reads Mini Headquarters' layouts with their own readers", () => {
  const miniHeadquarters = `Factions utilisées : Blood Angels
Points d'armée : 2000
Détachements : 
Blood Angels - Groupe d'Assaut Liberator
+++++++++++++++++++++++++++++++++++++++++++++++
Véhicules 1 : Repulsor [170pts] Bordée défensive Repulsor`
  const sectioned = `Adeptus Custodes : Liste
### Détachements : 
* Adeptus Custodes - Lions de l'Empereur
Custodiens Allarus (3) : 165 pts`
  expect([importRosterFormat(miniHeadquarters), importRosterFormat(sectioned)]).toEqual(['miniheadquarters', 'sectioned-list'])
})

it('reads no text with a line or a run of spaces longer than any list has', () => {
  const list = (line: string) => `Adeptus Custodes : Liste\n### Détachements :\n${line}\nCustodiens Allarus (3) : 165 pts`
  expect([importRosterFormat(list('x'.repeat(2_001))), importRosterFormat(list(`x${' '.repeat(101)}x`))]).toEqual([
    'unrecognized',
    'unrecognized',
  ])
})
