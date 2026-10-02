import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { battlemasterGeometry } from './rulesTerrain'

let directory: string
const id = 'terrain-01234567-89ab-cdef-0123-456789abcdef'

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-terrain-'))
  fs.mkdirSync(path.join(directory, 'layouts'))
  fs.writeFileSync(
    path.join(directory, 'layouts', `${id}.json`),
    JSON.stringify({
      layout: { id },
      terrain: [
        {
          name: 'Area AB',
          footprint: { origin: { x: 2, y: 3 }, widthIn: 5, heightIn: 3, rotationDeg: 90 },
          outline: {
            points: [
              { x: 0, y: 0 },
              { x: 5, y: 0 },
              { x: 5, y: 3 },
            ],
          },
          parts: [
            {
              name: 'Wall',
              material: 'solid',
              hasRoof: false,
              origin: { x: 0, y: 0 },
              rotationDeg: 0,
              mirroredX: false,
              mirroredY: false,
              outline: null,
              walls: [
                {
                  points: [
                    { x: 0, y: 0 },
                    { x: 5, y: 0 },
                  ],
                  thicknessIn: 0.25,
                },
              ],
            },
          ],
        },
      ],
    }),
  )
})

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

it('places terrain and walls in board coordinates', () => {
  expect(battlemasterGeometry(directory, id)?.areas[0]).toMatchObject({
    points: [
      { x: 32, y: 19 },
      { x: 32, y: 14 },
      { x: 29, y: 14 },
    ],
    parts: [
      {
        walls: [
          {
            points: [
              { x: 32, y: 19 },
              { x: 32, y: 14 },
            ],
            thickness: 0.25,
          },
        ],
      },
    ],
  })
})

it('measures a rotated footprint corner from the nearest board edges', () => {
  expect(battlemasterGeometry(directory, id)?.areas[0]?.measurements).toEqual([
    { from: { x: 60, y: 14 }, to: { x: 32, y: 14 } },
    { from: { x: 32, y: 0 }, to: { x: 32, y: 14 } },
  ])
})

it('locates both ends of a tilted straight edge', () => {
  const file = path.join(directory, 'layouts', `${id}.json`)
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  value.terrain[0].footprint.rotationDeg = 30
  value.terrain[0].outline.points.push({ x: 0, y: 3 })
  fs.writeFileSync(file, JSON.stringify(value))
  expect(battlemasterGeometry(directory, id)?.areas[0]?.measurements).toEqual([
    { from: { x: 60, y: 13.902 }, to: { x: 34.83, y: 13.902 } },
    { from: { x: 34.83, y: 0 }, to: { x: 34.83, y: 13.902 } },
    { from: { x: 30.5, y: 0 }, to: { x: 30.5, y: 16.402 } },
  ])
})

it('uses a real outline corner when a triangular footprint omits a bounding corner', () => {
  const file = path.join(directory, 'layouts', `${id}.json`)
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  value.terrain[0].footprint = { origin: { x: -20, y: 10 }, widthIn: 5, heightIn: 3, rotationDeg: 0 }
  fs.writeFileSync(file, JSON.stringify(value))
  expect(battlemasterGeometry(directory, id)?.areas[0]?.measurements).toEqual([
    { from: { x: 0, y: 12 }, to: { x: 10, y: 12 } },
    { from: { x: 10, y: 0 }, to: { x: 10, y: 12 } },
  ])
})

it('does not invent placement references when the outline is missing', () => {
  const file = path.join(directory, 'layouts', `${id}.json`)
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  value.terrain[0].outline.points = []
  fs.writeFileSync(file, JSON.stringify(value))
  expect(battlemasterGeometry(directory, id)?.areas[0]?.measurements).toEqual([])
})

it('does not invent objective positions from terrain names', () => {
  expect(battlemasterGeometry(directory, id)?.areas[0]?.objective).toBeNull()
})

it('rejects a detail with the wrong identity', () => {
  const file = path.join(directory, 'layouts', `${id}.json`)
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  value.layout.id = 'different'
  fs.writeFileSync(file, JSON.stringify(value))
  expect(battlemasterGeometry(directory, id)).toBeNull()
})

it('rejects an unsafe layout id', () => {
  expect(battlemasterGeometry(directory, '../other')).toBeNull()
})

it('applies a source-pinned terrain label correction to both matching areas', () => {
  const file = path.join(directory, 'layouts', `${id}.json`)
  const layout = JSON.parse(fs.readFileSync(file, 'utf8'))
  layout.layout.layoutKey = 'layout-key'
  layout.terrain.push(structuredClone(layout.terrain[0]))
  fs.writeFileSync(file, JSON.stringify(layout))
  fs.writeFileSync(path.join(directory, 'catalog.json'), JSON.stringify({ catalogKey: 'catalog-key' }))
  fs.writeFileSync(
    path.join(directory, 'terrain-labels.json'),
    JSON.stringify({
      format: 'praetorium.terrain-label-corrections.v1',
      battlemasterRevision: createHash('sha256').update('catalog-key').digest('hex'),
      corrections: [{ layoutId: id, layoutKey: 'layout-key', areaName: 'Area AB', from: 'AB', to: 'EF' }],
    }),
  )
  expect(battlemasterGeometry(directory, id)?.areas.flatMap((area) => area.markers.map((marker) => marker.label))).toEqual(['EF', 'EF'])
})

it('rejects a terrain label correction from another Battlemaster revision', () => {
  fs.writeFileSync(path.join(directory, 'catalog.json'), JSON.stringify({ catalogKey: 'current' }))
  fs.writeFileSync(
    path.join(directory, 'terrain-labels.json'),
    JSON.stringify({ format: 'praetorium.terrain-label-corrections.v1', battlemasterRevision: 'stale', corrections: [] }),
  )
  expect(() => battlemasterGeometry(directory, id)).toThrow('terrain label corrections do not match the Battlemaster source')
})
