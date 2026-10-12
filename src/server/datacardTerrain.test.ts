import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { terrainFromDatacards } from './datacardTerrain'
import { battlemasterGeometry } from './rulesTerrain'

let directory: string
const id = 'terrain-01234567-89ab-cdef-0123-456789abcdef'
const pack = { layouts: [{ id: 'layout-a', name: 'Purge the Foe / Reconnaissance - Layout A', deployments: [] }] }

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacard-terrain-'))
  fs.mkdirSync(path.join(directory, 'layouts'))
  fs.writeFileSync(path.join(directory, 'catalog.json'), JSON.stringify({ layouts: [{ id }] }))
  const part = (name: string) => ({
    name,
    material: 'solid',
    hasRoof: false,
    origin: { x: 0, y: 0 },
    rotationDeg: 0,
    mirroredX: false,
    mirroredY: false,
    boundsWidthIn: 5,
    boundsHeightIn: 3,
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
  })
  fs.writeFileSync(
    path.join(directory, 'layouts', `${id}.json`),
    JSON.stringify({
      layout: { id, chapterApprovedSlot: { archetypeA: 'purge-the-foe', archetypeB: 'reconnaissance', slotIndex: 1 } },
      terrain: [
        {
          name: 'Area AB',
          footprint: { origin: { x: 0, y: 0 }, widthIn: 5, heightIn: 3, rotationDeg: 0 },
          outline: {
            points: [
              { x: 0, y: 0 },
              { x: 5, y: 0 },
              { x: 5, y: 3 },
            ],
          },
          parts: [part('AB')],
        },
      ],
    }),
  )
})

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

it('leaves a layout unlabelled when a terrain letter does not appear twice', () => {
  expect(terrainFromDatacards([pack], directory).terrainLayouts[0]?.geometry?.areas[0]?.markers).toEqual([])
})

it('keeps the shared geometry labelled when one layout drops its letters', () => {
  terrainFromDatacards([pack], directory)
  expect(battlemasterGeometry(directory, id)?.areas[0]?.markers.map((marker) => marker.label)).toEqual(['AB'])
})
