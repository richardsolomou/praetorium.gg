import { expect, it } from 'vitest'
import { battlemasterObjectiveHosts } from './battlemasterObjectives'

const id = 'terrain-01234567-89ab-cdef-0123-456789abcdef'
const slot = { archetypeA: 'purge-the-foe', archetypeB: 'reconnaissance', slotIndex: 1 }
const detail = {
  layout: { chapterApprovedSlot: slot, chapterApprovedDeploymentKey: 3 },
  terrain: [
    { footprint: { origin: { x: -9, y: -3 }, widthIn: 8, heightIn: 4, rotationDeg: 0 } },
    { footprint: { origin: { x: 9, y: 3 }, widthIn: 8, heightIn: 4, rotationDeg: 180 } },
  ],
}
const lite = (codes: (string | undefined)[] = ['c', 'c']) => ({
  format: 'battlemaster.tts.chapter-approved-layout-lite',
  layout: { id, chapterApprovedSlot: slot, chapterApprovedDeploymentKey: 3 },
  litePayload: {
    v: 1,
    k: 'bml',
    id,
    b: 'sf60x44',
    a: 'c',
    s: ['purge-the-foe', 'reconnaissance', 1, 3],
    i: [
      [0, -5, -1, 0, 0, codes[0]],
      [0, 5, 1, 180, 0, codes[1]],
    ],
  },
})

it('keeps two unlinked central objective areas separate', () => {
  expect(battlemasterObjectiveHosts(detail, lite(), id)).toEqual([
    { position: { x: 25, y: 23 }, group: null },
    { position: { x: 35, y: 21 }, group: null },
  ])
})

it('links only the explicitly paired central objective codes', () => {
  expect(battlemasterObjectiveHosts(detail, lite(['c1', 'c2']), id).map((objective) => objective?.group)).toEqual(['center', 'center'])
})

it('leaves terrain without objective codes unmarked', () => {
  expect(battlemasterObjectiveHosts(detail, lite([undefined, undefined]), id)).toEqual([null, null])
})

it.each(['n', 'hb', 'hr', 'hl', 'ht'])('preserves the source position for an objective coded %s', (code) => {
  expect(battlemasterObjectiveHosts(detail, lite([code, undefined]), id)[0]).toEqual({ position: { x: 25, y: 23 }, group: null })
})

it('rejects a different layout before joining its objective areas', () => {
  const raw = lite()
  raw.litePayload.id = 'other'
  expect(() => battlemasterObjectiveHosts(detail, raw, id)).toThrow('objective layout identity')
})

it('rejects a different mission slot', () => {
  const raw = lite()
  raw.litePayload.s[2] = 2
  expect(() => battlemasterObjectiveHosts(detail, raw, id)).toThrow('objective layout identity')
})

it('rejects an incomplete terrain instance list', () => {
  const raw = lite()
  raw.litePayload.i.pop()
  expect(() => battlemasterObjectiveHosts(detail, raw, id)).toThrow('objective layout identity')
})

it('rejects reordered terrain instead of assigning objectives to the wrong area', () => {
  const raw = lite()
  raw.litePayload.i.reverse()
  expect(() => battlemasterObjectiveHosts(detail, raw, id)).toThrow('objective terrain 1')
})

it('rejects an unmatched terrain rotation', () => {
  const raw = lite()
  raw.litePayload.i[0]![3] = 90
  expect(() => battlemasterObjectiveHosts(detail, raw, id)).toThrow('objective terrain 1')
})

it('rejects an unsupported objective code', () => {
  expect(() => battlemasterObjectiveHosts(detail, lite(['invented', undefined]), id)).toThrow()
})
