import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalCatalogueInputDirectory, canonicalCatalogueOutputFile } from './canonicalCatalogueFiles'

const originalDirectory = process.env.CATALOGUE_DIR
const originalFile = process.env.CATALOGUE_CANONICAL_FILE

afterEach(() => {
  if (originalDirectory === undefined) delete process.env.CATALOGUE_DIR
  else process.env.CATALOGUE_DIR = originalDirectory
  if (originalFile === undefined) delete process.env.CATALOGUE_CANONICAL_FILE
  else process.env.CATALOGUE_CANONICAL_FILE = originalFile
})

describe('canonical catalogue files', () => {
  it('defaults outside the activated catalogue snapshot', () => {
    delete process.env.CATALOGUE_DIR
    delete process.env.CATALOGUE_CANONICAL_FILE
    const root = path.join(import.meta.dirname, '..')

    expect([canonicalCatalogueInputDirectory(), canonicalCatalogueOutputFile()]).toEqual([
      path.join(root, 'catalogue-data'),
      path.join(root, '.output', 'canonical-catalogue.json'),
    ])
  })

  it('honours explicit input and output paths', () => {
    process.env.CATALOGUE_DIR = '/tmp/praetorium-input'
    process.env.CATALOGUE_CANONICAL_FILE = '/tmp/praetorium-output.json'

    expect([canonicalCatalogueInputDirectory(), canonicalCatalogueOutputFile()]).toEqual([
      '/tmp/praetorium-input',
      '/tmp/praetorium-output.json',
    ])
  })
})
