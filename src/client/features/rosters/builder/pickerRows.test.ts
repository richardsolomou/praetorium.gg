import { describe, expect, it } from 'vitest'
import { type PickerLoadout, pickerRows } from './pickerRows'

const immortals = { id: 'immortals', name: 'Immortals', points: 70 }
const warriors = { id: 'warriors', name: 'Necron Warriors', points: 90 }
const book = [immortals, warriors]

const tesla: PickerLoadout = { id: 'a', name: 'Tesla wall', pick: { entryId: 'immortals', models: 10 }, points: 140 }
const gauss: PickerLoadout = { id: 'b', name: 'Gauss five', pick: { entryId: 'immortals' }, points: 70 }
const horde: PickerLoadout = { id: 'c', name: 'Horde', pick: { entryId: 'warriors', models: 20 }, points: 180 }
const retired: PickerLoadout = { id: 'd', name: 'Old guard', pick: { entryId: 'retired' }, points: null }
const loadouts = [tesla, gauss, horde, retired]

const rows = (options: { found?: typeof book; query?: string; keeps?: (entryId: string, points: number | null | undefined) => boolean }) =>
  pickerRows({ units: book, found: options.found ?? book, loadouts, query: options.query ?? '', keeps: options.keeps ?? (() => true) })

describe('pickerRows', () => {
  it('lists each loadout under its datasheet', () => {
    expect(rows({}).loadouts.get('immortals')).toEqual([tesla, gauss])
  })

  it('finds a loadout by name and shows its datasheet', () => {
    expect(rows({ found: [], query: 'tesla' }).units).toEqual([immortals])
  })

  it('shows only the loadout whose name was searched', () => {
    expect(rows({ found: [], query: 'tesla' }).loadouts.get('immortals')).toEqual([tesla])
  })

  it('shows every loadout of a datasheet the search found', () => {
    const found = [{ ...immortals, matchReasons: [{ kind: 'keyword' as const, value: 'Infantry' }] }]
    expect(rows({ found, query: 'infantry' }).loadouts.get('immortals')).toEqual([tesla, gauss])
  })

  it('keeps a datasheet the search found ahead of one shown only for its loadout', () => {
    expect(rows({ found: [warriors], query: 'tesla' }).units.map((unit) => unit.id)).toEqual(['warriors', 'immortals'])
  })

  it('hides a loadout whose datasheet a filter hides', () => {
    expect(rows({ keeps: (entryId) => entryId !== 'warriors' }).loadouts.get('warriors')).toBeUndefined()
  })

  it('filters a loadout by its own points', () => {
    const fits = (_: string, points: number | null | undefined) => points == null || points <= 100
    expect(rows({ keeps: fits }).loadouts.get('immortals')).toEqual([gauss])
  })

  it('keeps a datasheet a filter hides in its place when one of its loadouts passes', () => {
    const keeps = (_: string, points: number | null | undefined) => points !== immortals.points
    expect(rows({ keeps }).units.map((unit) => unit.id)).toEqual(['immortals', 'warriors'])
  })

  it('reports a loadout whose datasheet the book does not offer', () => {
    expect(rows({}).unavailable).toEqual([retired])
  })

  it('searches unavailable loadouts by name', () => {
    expect(rows({ found: [], query: 'tesla' }).unavailable).toEqual([])
  })
})
