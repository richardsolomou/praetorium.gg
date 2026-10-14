import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

describe('deployment territories', () => {
  const corner = (x: number, y: number) => [
    { x, y },
    { x: x + Math.sign(-x) * 6, y },
    { x, y: y + Math.sign(-y) * 6 },
  ]
  function attackerTerritory(territories: unknown) {
    const file = path.join(directory, 'layouts', `${id}.json`)
    const layout = JSON.parse(fs.readFileSync(file, 'utf8'))
    layout.deployment = {
      name: 'Hammer and Anvil',
      board: { widthIn: 60, heightIn: 44 },
      zones: [
        { role: 'attacker', points: corner(-30, 22) },
        { role: 'defender', points: corner(30, -22) },
      ],
      territories,
      objectives: Array.from({ length: 5 }, (_, index) => ({ center: { x: index, y: 0 } })),
    }
    fs.writeFileSync(file, JSON.stringify(layout))
    return terrainFromDatacards([{ ...pack, deployments: [{ id: 'deployment', name: 'Hammer and Anvil' }] }], directory).deployments[0]
      ?.attackerTerritory
  }
  const westHalf = [
    { x: -30, y: 22 },
    { x: 0, y: 22 },
    { x: 0, y: -22 },
    { x: -30, y: -22 },
  ]

  it('places the attacker territory on the board', () => {
    expect(attackerTerritory([{ role: 'attacker', points: westHalf }])).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 44 },
      { x: 0, y: 44 },
    ])
  })

  it('leaves the territory absent when the source omits it', () => {
    expect(attackerTerritory(undefined)).toBeNull()
  })

  it('leaves the territory absent when the source gives only the defender half', () => {
    expect(attackerTerritory([{ role: 'defender', points: westHalf }])).toBeNull()
  })

  it('leaves the territory absent when the source gives more than one', () => {
    expect(
      attackerTerritory([
        { role: 'attacker', points: westHalf },
        { role: 'attacker', points: westHalf },
      ]),
    ).toBeNull()
  })
})
