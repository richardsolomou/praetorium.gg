import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSourceUnits, sourceBaseSize, sourceComposition, sourceCosts } from './catalogueSourceUnits'

describe('catalogue source units', () => {
  it('indexes reused source ids by their exact BSData references', () => {
    const core = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-source-units-'))
    try {
      for (const [faction, reference, name] of [
        ['one', 'bsdata-one', 'First Rhino'],
        ['two', 'bsdata-two', 'Second Rhino'],
      ] as const) {
        const directory = path.join(core, faction)
        fs.mkdirSync(directory)
        fs.writeFileSync(
          path.join(directory, 'units.json'),
          JSON.stringify([{ id: 'rhino', name, external_refs: [{ namespace: 'bsdata', id: reference }] }]),
        )
      }

      const units = loadSourceUnits(core)

      expect(units.get('bsdata-one')).toEqual([expect.objectContaining({ id: 'rhino', name: 'First Rhino' })])
      expect(units.get('bsdata-two')).toEqual([expect.objectContaining({ id: 'rhino', name: 'Second Rhino' })])
    } finally {
      fs.rmSync(core, { recursive: true })
    }
  })

  it('only exposes point rows whose repeated conditions agree', () => {
    expect(
      sourceCosts([
        { models: 5, modelsMax: null, cost: 90 },
        { models: 5, modelsMax: null, cost: 100 },
        { models: 6, modelsMax: 10, cost: 180 },
      ]),
    ).toEqual([{ models: '6-10', cost: '180', keyword: null, faction: null, detachment: null }])
  })

  it('turns a source model-count range into a display fallback', () => {
    expect(sourceComposition({ min: 5, max: 10 })).toEqual(['5-10 models'])
  })

  it('only publishes verified base sizes', () => {
    expect(sourceBaseSize({ shape: 'round', diameter: 32, draft: false })).toBe('32mm')
    expect(sourceBaseSize({ shape: 'hull', draft: true })).toBeNull()
  })

  it('rejects a draft base size read from a source file', () => {
    const core = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-source-units-'))
    try {
      const directory = path.join(core, 'test')
      fs.mkdirSync(directory)
      fs.writeFileSync(
        path.join(directory, 'units.json'),
        JSON.stringify([
          {
            id: 'draft-unit',
            name: 'Draft unit',
            base_size_mm: { shape: 'hull', draft: true },
            external_refs: [{ namespace: 'bsdata', id: 'draft-unit' }],
          },
        ]),
      )

      expect(sourceBaseSize(loadSourceUnits(core).get('draft-unit')?.[0]?.baseSize ?? null)).toBeNull()
    } finally {
      fs.rmSync(core, { recursive: true })
    }
  })
})
