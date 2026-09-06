import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadTerrainLayouts } from './rulesTerrain'

let directory: string
const id = 'terrain-01234567-89ab-cdef-0123-456789abcdef'
const points = [
  { x: 0, y: 0 },
  { x: 5, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
]
const area = {
  id: 'area',
  name: 'Area',
  footprint: { origin: { x: 2, y: 3 }, widthIn: 5, heightIn: 3, rotationDeg: 90 },
  outline: { points },
  parts: [],
}
const template = {
  id: 'template',
  name: 'Template',
  kind: 'area',
  footprint: { type: 'polygon', points: points.map((point) => ({ x: point.x, y: 3 - point.y })) },
}
const piece = { id: 'area', name: 'Area', piece_type: 'area', template: 'template', position: { x: 30, y: 20 } }

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-terrain-'))
  fs.mkdirSync(path.join(directory, 'layouts'))
})
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

function load(pieces: unknown[], areas = [area], templates = [template]) {
  fs.writeFileSync(
    path.join(directory, 'terrain-layouts.json'),
    JSON.stringify([{ id: 'layout', name: 'Layout', mission_matchup_id: 'matchup', description: `Battlemaster layout ${id}`, pieces }]),
  )
  fs.writeFileSync(path.join(directory, 'terrain-templates.json'), JSON.stringify(templates))
  fs.writeFileSync(path.join(directory, 'layouts', `${id}.json`), JSON.stringify({ layout: { id }, terrain: areas }))
  return loadTerrainLayouts(directory, directory)[0]!.geometry!
}

describe('source objective metadata', () => {
  it('does not infer an objective from terrain letters or stray metadata', () => {
    const geometry = load(
      [
        { ...piece, id: 'lettered' },
        { ...piece, id: 'disabled', is_objective: false, objective: { position: { x: 7, y: 8 } }, link_group: 'center' },
      ],
      [
        { ...area, id: 'lettered', name: 'Area AB' },
        { ...area, id: 'disabled', name: 'Area CD' },
      ],
    )
    expect(geometry.areas.map((entry) => entry.objective)).toEqual([null, null])
  })

  it('keeps explicit positions and groups on unlettered terrain, matching pieces by id', () => {
    const geometry = load([
      { ...piece, id: 'other' },
      { ...piece, is_objective: true, objective: { position: { x: 7, y: 8 } }, link_group: 'center' },
    ])
    expect(geometry.areas[0]!.objective).toEqual({ position: { x: 7, y: 8 }, group: 'center' })
  })

  it('uses the piece position when the source omits an objective position', () => {
    expect(load([{ ...piece, is_objective: true }]).areas[0]!.objective).toEqual({ position: piece.position, group: null })
  })
})

describe('source placement measurements', () => {
  it('keeps the third reference that fixes the rotation of a piece', () => {
    const geometry = load([
      {
        ...piece,
        keystones: [
          { edge: 'left', ref: { kind: 'vertex', index: 1 } },
          { edge: 'top', ref: { kind: 'vertex', index: 1 } },
          { edge: 'left', ref: { kind: 'vertex', index: 2 } },
        ],
      },
    ])
    expect(geometry.areas[0]!.measurements).toEqual([
      { from: { x: 0, y: 14 }, to: { x: 32, y: 14 } },
      { from: { x: 32, y: 0 }, to: { x: 32, y: 14 } },
      { from: { x: 0, y: 15 }, to: { x: 29, y: 15 } },
    ])
  })

  it('measures from the far board edges without changing the referenced vertex', () => {
    expect(
      load([
        {
          ...piece,
          keystones: [
            { edge: 'right', ref: { kind: 'vertex', index: 0 } },
            { edge: 'bottom', ref: { kind: 'vertex', index: 0 } },
          ],
        },
      ]).areas[0]!.measurements,
    ).toEqual([
      { from: { x: 60, y: 19 }, to: { x: 32, y: 19 } },
      { from: { x: 32, y: 44 }, to: { x: 32, y: 19 } },
    ])
  })

  it('does not invent measurements when the source supplies none', () => {
    expect(load([piece]).areas[0]!.measurements).toEqual([])
  })

  it('omits invalid or unsupported references', () => {
    expect(
      load([
        {
          ...piece,
          keystones: [
            { edge: 'left', ref: { kind: 'vertex', index: -1 } },
            { edge: 'left', ref: { kind: 'vertex', index: 100 } },
            { edge: 'left', ref: { kind: 'vertex', index: 1.5 } },
            { edge: 'left', ref: { kind: 'unknown', index: 0 } },
            { edge: 'unknown', ref: { kind: 'vertex', index: 0 } },
          ],
        },
      ]).areas[0]!.measurements,
    ).toEqual([])
  })

  it('omits references when the template is absent or its vertex order differs', () => {
    const source = { ...piece, keystones: [{ edge: 'left', ref: { kind: 'vertex', index: 0 } }] }
    expect(load([source], [area], []).areas[0]!.measurements).toEqual([])
    const reordered = { ...template, footprint: { ...template.footprint, points: template.footprint.points.toReversed() } }
    expect(load([source], [area], [reordered]).areas[0]!.measurements).toEqual([])
  })
})
