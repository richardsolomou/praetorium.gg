/**
 * Genuine exports from other army builders, for import tests.
 *
 * ListForge texts are the `detailedText` and `wtcText` ListForge's share viewer
 * (share.listforge.club) receives for lists on its featured-lists page; Warmind texts were
 * copied from the Warmind web builder (warmind.online/builder, points of 14 October 2026)
 * on 18 October 2026. Each is shortened to a few units, with the list name replaced and the
 * stated totals reduced to the units kept; every other line is as the tool wrote it.
 */

/** ListForge's detailed text for a featured tournament list: two detachments, attached units with an enhancement and the Warlord, mixed squad wargear and a repeated unit. */
export const listForgeDetailed = `Sanitised list - Drukhari - Reconnaissance - Exhibition of Slaughter, Kabalite Cartel (510 Points)
Attached Units:
Archon + Kabalite Warriors (220 pts)
  Archon (110 pts)
    • Shadowfield
    • Soul Trap
    • Huskblade
    • Warlord
    • E: Informant Network
  Kabalite Warriors (110 pts)
    • Sybarite
      • Splinter Rifle
      • Power Weapon
      • Phantasm Grenade Launcher
    • Kabalite Warrior with Dark Lance
      • Dark lance
      • Close Combat Weapon
    • Kabalite Warrior with Splinter Cannon
      • Splinter cannon
      • Close Combat Weapon
    • Kabalite Warrior with Blaster
      • Blaster
      • Close Combat Weapon
    • Kabalite Warrior with Shredder
      • Shredder
      • Close Combat Weapon
    • 5x Kabalite Warrior
      • 5x Splinter rifle
      • 5x Close Combat Weapon

Succubus + Wyches (160 pts)
  Succubus (70 pts)
    • Archite glaive and agoniser
    • E: Periapt of Torments
  Wyches (90 pts)
    • Hekatrix
      • Blast Pistol
      • Power weapon
    • 6x Wych
      • 6x Splinter Pistol
      • 6x Hekatarii Blade
    • 3x Wych w/ Gladiatorial weapons
      • 3x Gladiatorial weapons


Dedicated Transport:
Venom (65 pts)
  • Bladevanes
  • Splinter Cannon
  • Splinter Cannon

Venom (65 pts)
  • Bladevanes
  • Splinter Cannon
  • Splinter Cannon

`

/** ListForge's WTC text for the same list. */
export const listForgeWtc = `+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
List Name: Sanitised list
Factions Used: Drukhari
Army Points: 510
Army Enhancements (list on which model): Informant Network (on Archon), Periapt of Torments (on Succubus)
Disposition: Reconnaissance
Detachment(s): Exhibition of Slaughter, Kabalite Cartel
+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

ATTACHED UNITS:
Archon + Kabalite Warriors (220 pts)
  Archon (110 pts)
    • Huskblade
    • Shadowfield
    • Soul Trap
    • Warlord
    • Enhancement: Informant Network
  Kabalite Warriors (110 pts)
    • 5x Kabalite Warrior
      • 5x Close Combat Weapon
      • 5x Splinter rifle
    • Kabalite Warrior with Blaster
      • Blaster
      • Close Combat Weapon
    • Kabalite Warrior with Dark Lance
      • Close Combat Weapon
      • Dark lance
    • Kabalite Warrior with Shredder
      • Close Combat Weapon
      • Shredder
    • Kabalite Warrior with Splinter Cannon
      • Close Combat Weapon
      • Splinter cannon
    • Sybarite
      • Phantasm Grenade Launcher
      • Power Weapon
      • Splinter Rifle

Succubus + Wyches (160 pts)
  Succubus (70 pts)
    • Archite glaive and agoniser
    • Enhancement: Periapt of Torments
  Wyches (90 pts)
    • Hekatrix
      • Blast Pistol
      • Power weapon
    • 6x Wych
      • 6x Hekatarii Blade
      • 6x Splinter Pistol
    • 3x Wych w/ Gladiatorial weapons
      • 3x Gladiatorial weapons


DEDICATED TRANSPORTS:
Venom (65 pts)
  • Bladevanes
  • Splinter Cannon
  • Splinter Cannon

Venom (65 pts)
  • Bladevanes
  • Splinter Cannon
  • Splinter Cannon

`

/** ListForge's detailed text for a list with allies, which it heads with the allied faction. */
export const listForgeAllies = `Sanitised list - Grey Knights - Take and Hold - Warpbane Task Force (285 Points)


Vehicle:
Nemesis Dreadknight (220 pts)
  • Heavy incinerator
  • Heavy psycannon
  • Nemesis daemon greathammer


Allies: Imperial Agents:
Imperial Rhino (65 pts)
  • Storm bolter
  • Armoured tracks
  • Hunter-killer missile

`

/** ListForge's detailed text names each model before its wargear; one Piranha carries two of some weapons. */
export const listForgePiranhas = `Sanitised list - T'au Empire - Reconnaissance - Experimental Prototype Cadre, Kauyon (65 Points)


Vehicle:
Piranhas (65 pts)
  • Piranhas
    • Armoured hull
    • 2x Twin pulse carbine
    • Piranha fusion blaster
    • 2x Seeker missile

`

/** ListForge's WTC text names a faction by its keyword. */
export const listForgeWtcKeyword = `+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
List Name: Sanitised list
Factions Used: Legiones Daemonica
Army Points: 685
Army Enhancements (list on which model): The Endless Gift (on Great Unclean One)
Disposition: Take and Hold
Detachment(s): Daemonic Incursion
+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

CHARACTERS:
Be'lakor (390 pts)
  • Betraying Shades
  • The Blade of Shadows
  • Warlord

Great Unclean One (295 pts)
  • Bileblade
  • Bilesword
  • Putrid vomit
  • Enhancement: The Endless Gift

`

/** Warmind's own text, after importing Praetorium's Warmind layout of the list above and choosing both detachments and the disposition in Warmind. */
export const warmind = `Sanitised list
──────────────────────────────
Faction: Drukhari
Detachment: Exhibition of Slaughter, Kabalite Cartel
Battle Size: Strike Force (2000 pts)
Total: 510 / 2000 pts · 3/3 DP · ✓ Legal
Disposition: Reconnaissance

BATTLELINE
Archon (110 pts) · Warlord
   · Soul Trap, Huskblade
   · Enhancement: Informant Network (+30 pts)
   └ Leads: Kabalite Warriors ×10 (110 pts)
      · Blaster, Dark Lance, Phantasm Grenade Launcher, Shredder, Splinter Cannon, 6× Splinter Rifle, 9× Close Combat Weapon, Power Weapon

Succubus (70 pts)
   · Archite Glaive and Agoniser
   · Enhancement: Periapt of Torments (+20 pts)
   └ Leads: Wyches ×10 (90 pts)
      · 7× Splinter Pistol, 3× Gladiatorial Weapons, 7× Hekatarii Blade

DEDICATED TRANSPORT
Venom (65 pts)
   · 2× Splinter Cannon, Bladevanes

Venom (65 pts)
   · 2× Splinter Cannon, Bladevanes

──────────────────────────────
510 / 2000 pts · 6 units · Strike Force
Built with Warmind · https://warmind.online`

/** Warmind's "ListForge" text for the same list: setup on lines of its own, and each unit's wargear on one "B:" line. */
export const warmindListForge = `Sanitised list - Drukhari - Exhibition of Slaughter, Kabalite Cartel (350 Points)

Battle Size: Strike Force (2000 point limit)
Force Disposition: Reconnaissance

Character:
Archon (110 pts)
• Warlord
• E: Informant Network
• B: Soul Trap, Huskblade

Battleline:
Kabalite Warriors (110 pts)
• B: Blaster, Dark Lance, Phantasm Grenade Launcher, Shredder, Splinter Cannon, 6x Splinter Rifle, 9x Close Combat Weapon, Power Weapon

Dedicated Transport:
Venom (65 pts)
• B: 2x Splinter Cannon, Bladevanes
Venom (65 pts)
• B: 2x Splinter Cannon, Bladevanes`

/** Warmind's "New Recruit (WTC)" text for the same list. */
export const warmindWtc = `+ FACTION KEYWORD: Drukhari
+ DETACHMENT: Exhibition of Slaughter, Kabalite Cartel
+ TOTAL ARMY POINTS: 350pts
+ BATTLE SIZE: Strike Force (2000 point limit)
+ FORCE DISPOSITION: Reconnaissance
+ WARLORD: Char1: Archon
+ ENHANCEMENT: Informant Network (on Char1: Archon)
+ NUMBER OF UNITS: 4

CHARACTER

Char1: 1x Archon (110 pts): Warlord, Soul Trap, Huskblade
Enhancement: Informant Network (+30 pts)

OTHER DATASHEETS

10x Kabalite Warriors (110 pts)
9 with Close Combat Weapon
6 with Splinter Rifle
1 with Blaster, Dark Lance, Phantasm Grenade Launcher, Shredder, Splinter Cannon, Power Weapon

1x Venom (65 pts)
2 with Splinter Cannon
1 with Bladevanes

1x Venom (65 pts)
2 with Splinter Cannon
1 with Bladevanes`

/** Warmind's "Official app" text for the same list, one detachment to a line. */
export const warmindOfficial = `Sanitised list (350 points)

Drukhari
Exhibition of Slaughter (1 Detachment Point)
Kabalite Cartel (2 Detachment Points)
Strike Force (2000 points)
Force Disposition: Reconnaissance

ATTACHED UNITS

Attached unit 1
Archon (110 points)
  • Warlord
  • Enhancement: Informant Network
  • Attached as: Leader (Character)
  • Soul Trap
  • Huskblade
Kabalite Warriors (110 points)
  • Attached as: Bodyguard (Battleline)
  • Blaster
  • Dark Lance
  • Phantasm Grenade Launcher
  • Shredder
  • Splinter Cannon
  • 6x Splinter Rifle
  • 9x Close Combat Weapon
  • Power Weapon

DEDICATED TRANSPORTS

Venom (65 points)
  • 2x Splinter Cannon
  • Bladevanes

Venom (65 points)
  • 2x Splinter Cannon
  • Bladevanes
`
