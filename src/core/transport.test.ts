import { describe, expect, it } from 'vitest'
import { type Passenger, transportLoad, transportRule } from './transport'

const RHINO =
  'This model has a **transport capacity** of 12 **Adeptus Astartes Infantry** models. It cannot transport **Gravis/Jump Pack/Terminator** models.'
const REDEEMER =
  'This model has a **transport capacity** of 14 **Adeptus Astartes Infantry** models. It cannot transport **Jump Pack** models. Each **Gravis/Terminator** model takes up the space of 2 models.'
const FALCON =
  'This model has a transport capacity of 6 **AELDARI INFANTRY** models. Each **WRAITH CONSTRUCT** model takes the space of 2 models. It cannot transport **JUMP PACK** models or **YNNARI** models (excluding **ASURYANI**, **YVRAINE** and **THE VISARCH** models).'
const GHOST_ARK = 'This model has a transport capacity of 10 **NECRON WARRIOR** models and 1 **NECRONS INFANTRY CHARACTER** model.'
const STORMRAVEN =
  'This model has a transport capacity of 12 Adeptus Astartes Infantry models. And 1 Dreadnought models. Each Jump Pack, Wulfen, Gravis, Terminator model takes up the space of 2 models. Each Centurion model takes up the space of 3 models.'
const HIEROPHANT =
  'This model has a transport capacity of 20 **TYRANIDS INFANTRY** models. Each model with a Wounds characteristic of more than 1 takes up the space of 3 models. This model cannot transport models that can **FLY**.'
const TYRANNOCYTE =
  'This model has a transport capacity of 20 **TYRANIDS INFANTRY** models, or 1 **TYRANIDS MONSTER** model with a Wounds characteristic of 12 or less. Each Infantry model with a Wounds characteristic of more than 1 takes up the space of 3 models.'
const YNNARI_VENOM =
  'This model has a transport capacity of 6 models from the following units: **THE VISARCH**, **YNNARI ARCHON**, **YNNARI INCUBI**, **YNNARI KABALITE WARRIORS**, **YNNARI SUCCUBUS**, **YNNARI WYCHES**, **YVRAINE**'
const BATTLEWAGON =
  'This model has a transport capacity of 20 **ORKS INFANTRY** models. If this model is equipped with a supa-kannon, it has a transport capacity of 15 **ORKS INFANTRY** models.'

const marines = (name: string, alive: number, ...extra: string[]): Passenger => ({
  name,
  alive,
  keywords: ['Faction: Adeptus Astartes', 'Imperium', 'Infantry', ...extra],
})
const loadIn = (printed: string, passengers: Passenger[], wargear?: { name: string; count: number }[]) =>
  transportLoad(transportRule(printed, wargear)!, passengers)
const used = (load: ReturnType<typeof loadIn>) => (Array.isArray(load) ? load.map((pool) => pool.used) : load.message)

describe('transport rules', () => {
  it.each([
    ['a capacity of models', 'This model has a transport capacity of 12 **INFANTRY** models.', [12]],
    ['a choice of keywords', 'This model has a transport capacity of 7 **TACTICUS** or **PHOBOS INFANTRY** models.', [7]],
    ['bold markup around the term', RHINO, [12]],
    ['a second allowance', GHOST_ARK, [10, 1]],
    ['an allowance in its own sentence', STORMRAVEN, [12, 1]],
  ])('reads %s', (_scenario, printed, capacities) => {
    expect(transportRule(printed)?.loads[0]?.map((pool) => pool.capacity)).toEqual(capacities)
  })

  it.each([
    ['a capacity in units', 'This model has a transport capacity of 1 NECRONS INFANTRY unit.'],
    [
      'a capacity that changes in play',
      'This model has a transport capacity of 12 INFANTRY models. While carrying a DREADNOUGHT, its transport capacity is reduced to 6 INFANTRY models.',
    ],
    [
      'a space that does not say which allowance it fills',
      'This model has a transport capacity of 45 Adeptus Astartes Infantry models. And 2 Dreadnought models. Each **Dreadnought** model take up the space of a number of models equal to their **W** characteristic.',
    ],
    ['a capacity without a wargear selection to decide it', BATTLEWAGON],
  ])('does not read %s', (_scenario, printed) => {
    expect(transportRule(printed)).toBeNull()
  })

  it.each([
    [[], 20],
    [[{ name: 'supa-kannon', count: 1 }], 15],
  ])('uses the Battlewagon capacity for its selected wargear', (wargear, capacity) => {
    expect(transportRule(BATTLEWAGON, wargear)?.loads[0]?.[0]?.capacity).toBe(capacity)
  })

  it('ignores the sentences about splitting a unit to embark', () => {
    const immolator =
      'This model has a transport capacity of 6 **ADEPTA SORORITAS INFANTRY** models. It cannot transport **JUMP PACK** models or the **TRIUMPH OF SAINT KATHERINE**.\n\nAt the start of the Declare Battle Formations step, you can select one **Battle Sisters Squad** from your army. If you do, that unit is split into two units, each containing as equal a number of models as possible. One of these units must start the battle embarked within this TRANSPORT; the other can start the battle embarked within another TRANSPORT, or it can be deployed as a separate unit.’'
    expect(transportRule(immolator)?.loads[0]?.[0]?.capacity).toBe(6)
  })
})

describe('transport loads', () => {
  it('carries the keywords it names', () => {
    expect(used(loadIn(RHINO, [marines('Intercessor Squad', 5, 'Tacticus')]))).toEqual([5])
  })

  it('refuses a unit the rule excludes', () => {
    expect(used(loadIn(RHINO, [marines('Terminator Squad', 5, 'Terminator')]))).toBe('this transport cannot carry Terminator Squad')
  })

  it('refuses a unit without the keywords it carries', () => {
    const dreadnought = { name: 'Redemptor Dreadnought', alive: 1, keywords: ['Faction: Adeptus Astartes', 'Vehicle', 'Dreadnought'] }
    expect(used(loadIn(RHINO, [dreadnought]))).toBe('this transport cannot carry Redemptor Dreadnought')
  })

  it('refuses a unit of another faction', () => {
    const boyz = { name: 'Boyz', alive: 10, keywords: ['Faction: Orks', 'Infantry'] }
    expect(used(loadIn(RHINO, [boyz]))).toBe('this transport cannot carry Boyz')
  })

  it('counts the space a larger model takes', () => {
    expect(used(loadIn(REDEEMER, [marines('Terminator Squad', 5, 'Terminator')]))).toEqual([10])
  })

  it('refuses passengers whose space exceeds the capacity', () => {
    expect(used(loadIn(REDEEMER, [marines('Terminator Squad', 5, 'Terminator'), marines('Intercessor Squad', 5)]))).toBe(
      'this transport can carry at most 14 models',
    )
  })

  it('carries a unit in the allowance that names it', () => {
    const dreadnought = { name: 'Redemptor Dreadnought', alive: 1, keywords: ['Faction: Adeptus Astartes', 'Vehicle', 'Dreadnought'] }
    expect(used(loadIn(STORMRAVEN, [marines('Intercessor Squad', 5), dreadnought]))).toEqual([5, 1])
  })

  it('names every allowance when the passengers fit none of them', () => {
    const dreadnoughts = { name: 'Brutalis Dreadnoughts', alive: 2, keywords: ['Faction: Adeptus Astartes', 'Vehicle', 'Dreadnought'] }
    expect(used(loadIn(STORMRAVEN, [dreadnoughts]))).toBe(
      'this transport can carry at most 12 Adeptus Astartes Infantry and 1 Dreadnought models',
    )
  })

  it('carries a character in its own allowance', () => {
    const warriors = { name: 'Necron Warriors', alive: 10, keywords: ['Faction: Necrons', 'Infantry', 'Necron Warriors'] }
    const overlord = { name: 'Overlord', alive: 1, keywords: ['Faction: Necrons', 'Infantry', 'Character'] }
    expect(used(loadIn(GHOST_ARK, [warriors, overlord]))).toEqual([10, 1])
  })

  it.each([
    ['Asuryani', ['Faction: Aeldari', 'Infantry', 'Ynnari', 'Asuryani'], [5]],
    ['Ynnari Wyches', ['Faction: Aeldari', 'Infantry', 'Ynnari'], 'this transport cannot carry Ynnari Wyches'],
  ])('applies the exceptions to an excluded keyword for %s', (name, keywords, expected) => {
    expect(used(loadIn(FALCON, [{ name, alive: 5, keywords }]))).toEqual(expected)
  })

  it.each([
    ['Ynnari Wyches', ['Faction: Aeldari', 'Infantry', 'Ynnari', 'Wyches'], [5]],
    ['Wyches', ['Faction: Aeldari', 'Infantry', 'Wyches'], 'this transport cannot carry Wyches'],
  ])('carries only the units a rule lists for %s', (name, keywords, expected) => {
    expect(used(loadIn(YNNARI_VENOM, [{ name, alive: 5, keywords }]))).toEqual(expected)
  })

  it.each([
    ['one Wound', 1, [5]],
    ['more Wounds', 2, [15]],
  ])('counts the space of a model with %s', (_scenario, wounds, expected) => {
    expect(used(loadIn(HIEROPHANT, [{ name: 'Termagants', alive: 5, wounds, keywords: ['Faction: Tyranids', 'Infantry'] }]))).toEqual(
      expected,
    )
  })

  it('refuses a unit that can fly', () => {
    const gargoyles = { name: 'Gargoyles', alive: 10, wounds: 1, keywords: ['Faction: Tyranids', 'Infantry', 'Fly'] }
    expect(used(loadIn(HIEROPHANT, [gargoyles]))).toBe('this transport cannot carry Gargoyles')
  })

  it('refuses a unit whose Wounds the rule needs but the roster does not hold', () => {
    expect(used(loadIn(HIEROPHANT, [{ name: 'Tyranid Warriors', alive: 3, keywords: ['Faction: Tyranids', 'Infantry'] }]))).toBe(
      'Tyranid Warriors has no single Wounds characteristic for this transport to measure',
    )
  })

  it.each([
    ['a monster in its other load', { name: 'Carnifex', alive: 1, wounds: 9, keywords: ['Faction: Tyranids', 'Monster'] }, [1]],
    [
      'a monster above its Wounds limit',
      { name: 'Tyrannofex', alive: 1, wounds: 16, keywords: ['Faction: Tyranids', 'Monster'] },
      'this transport cannot carry Tyrannofex',
    ],
  ])('fills one of the loads a transport offers with %s', (_scenario, passenger, expected) => {
    expect(used(loadIn(TYRANNOCYTE, [passenger]))).toEqual(expected)
  })

  it('refuses passengers that fit no single load', () => {
    const carnifex = { name: 'Carnifex', alive: 1, wounds: 9, keywords: ['Faction: Tyranids', 'Monster'] }
    const termagants = { name: 'Termagants', alive: 10, wounds: 1, keywords: ['Faction: Tyranids', 'Infantry'] }
    expect(used(loadIn(TYRANNOCYTE, [carnifex, termagants]))).toBe(
      'this transport can carry at most 20 TYRANIDS INFANTRY, or 1 TYRANIDS MONSTER (up to 12 Wounds) models',
    )
  })

  it('matches a keyword printed with a curly apostrophe', () => {
    const devilfish = 'This model has a transport capacity of 12 **T’AU EMPIRE INFANTRY** models.'
    expect(used(loadIn(devilfish, [{ name: 'Strike Team', alive: 10, keywords: ["Faction: T'au Empire", 'Infantry'] }]))).toEqual([10])
  })

  it('refuses a unit whose datasheet prints no keywords', () => {
    expect(used(loadIn(RHINO, [{ name: 'Sentry Gun', alive: 1, keywords: [] }]))).toBe('this transport cannot carry Sentry Gun')
  })

  it('counts a passenger frozen without keywords one space per model', () => {
    expect(used(loadIn(RHINO, [{ name: 'Terminator Squad', alive: 5 }]))).toEqual([5])
  })
})
