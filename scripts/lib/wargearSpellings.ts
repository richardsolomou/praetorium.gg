import { wargearKey } from '../../src/core/wargearNames'

/** Reviewed spellings: wargear as VS Data names it, by BSData's name, both as `wargearKey`s, read where the unit's VS Data wargear holds VS Data's and not BSData's. */
export const SPELLINGS: Record<string, string | string[]> = {
  'absolver-bolt-pistol': 'absolvor-bolt-pistol',
  'adrathic-combi-destructors': 'adrathic-combi-destructor',
  agonizer: 'agoniser',
  'astartes-chainsword': 'chainsword',
  'astraeus-las-ripper': 'astareus-las-ripper',
  'axe-morkai': 'axe-of-morkai',
  'befouled-fangs-and-claws': 'befouled-claws-and-fangs',
  'bladed-horn': 'juggernauts-bladed-horn',
  'cavalry-sabre-clawed-limbs': 'cavalry-sabre-and-clawed-limbs',
  chainsword: 'astartes-chainsword',
  'channeler-stones': 'channeller-stones',
  'chirugeons-tools': 'chirurgeons-tools',
  'close-combat-weapons': 'close-combat-weapon',
  'combi-bolter': 'plague-combi-bolter',
  'commisars-pistol': 'commissars-pistol',
  'death-korps-of-krieg-medi-pack': 'death-korps-medi-pack',
  'distendible-jaw': 'distensible-jaw',
  'exo-armour-grenade-launcher': 'exoarmour-grenade-launcher',
  'fires-of-tzeentch': 'fire-of-tzeentch',
  'godhammer-lascannon': 'godhammer-lascannons',
  'grav-chute': 'grav-chutes',
  hellspear: 'helspear',
  'hellstrike-missiles': 'hellstrike-missile',
  'improvised-weapons': 'improvised-weapon',
  'kratos-battlecannon': 'kratos-battle-cannon',
  'lancer-laser-destroyer': 'laser-destroyer',
  'laservolley-cannon': 'laser-volley-cannon',
  'lashing-tongues': 'lashing-tongue',
  'lastrum-storm-bolters': 'lastrum-storm-bolter',
  'macharius-twin-battlecannon': 'macharius-twin-battle-cannon',
  'magma-cutter': 'magma-cutters',
  'master-crafted-power-weapon': 'master-crafted-power-sword',
  'multiple-rocket-pods': 'multiple-rocket-pod',
  'novitiate-autogun': 'autogun',
  'nuncio-aquila': 'nuncio-acquila',
  'pan-spectral-scanner': 'panspectral-scanner',
  'relic-great-axe': 'relic-greataxe',
  'scout-sniper-rifle': 'sniper-rifle',
  'seeker-tongues': 'exalted-seeker-tongues',
  'servo-arm': 'servitors-servo-arm',
  spinemaw: 'spinemaws',
  'sporocyst-bio-weapon': 'sporocyst-bio-weapons',
  'squig-jaws': 'squigs-jaws',
  'steeds-savage-claws': 'savage-claws',
  'superfrag-missile-launcher': 'superfrag-rocket-launcher',
  'superkrak-missile-launcher': 'superkrak-rocket-launcher',
  'teeth-and-claws': ['crushing-teeth-and-claws', 'crushing-teeth-and-jaws'],
  'termagant-spinefist': 'termagant-spinefists',
  'termite-melta-cutter': 'terrax-melta-cutter',
  'toxinjecter-harpoon': 'toxinjector-harpoon',
  'transonic-razor-chordclaw': 'transonic-razor-and-chordclaw',
  'twin-concussion-gauntlets': 'twin-concussion-gauntlet',
  'twin-infernus-incinerators': 'twin-infernus-incinerator',
  'twin-killsaw': 'twin-killsaws',
  'twin-power-fist': 'twin-power-fists',
  'zealots-vindicator': 'zealots-vindictor',
}
/** A leading article BSData prints on a named weapon and VS Data does not, as in The Emperor's Sword. */
export const ARTICLE = /^the-/

/** A BSData name as VS Data spells it, where the unit's VS Data wargear lacks BSData's spelling. */
export const vsSpelling = (name: string, vsKeys: ReadonlySet<string>) => {
  const key = wargearKey(name).replace(ARTICLE, '')
  return vsKeys.has(key) ? key : ([SPELLINGS[key] ?? []].flat().find((spelling) => vsKeys.has(spelling)) ?? key)
}
