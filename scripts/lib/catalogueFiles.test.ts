import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { catalogueDataDirectory, canonicalCatalogueOutputFile } from './catalogueFiles'

const originalDirectory = process.env.CATALOGUE_DIR
const originalFile = process.env.CATALOGUE_CANONICAL_FILE

afterEach(() => {
  if (originalDirectory === undefined) delete process.env.CATALOGUE_DIR
  else process.env.CATALOGUE_DIR = originalDirectory
  if (originalFile === undefined) delete process.env.CATALOGUE_CANONICAL_FILE
  else process.env.CATALOGUE_CANONICAL_FILE = originalFile
})

describe('catalogue files', () => {
  it('defaults to the repository catalogue and an output outside it', () => {
    delete process.env.CATALOGUE_DIR
    delete process.env.CATALOGUE_CANONICAL_FILE
    const root = path.join(import.meta.dirname, '..', '..')

    expect([catalogueDataDirectory(), canonicalCatalogueOutputFile()]).toEqual([
      path.join(root, 'catalogue-data'),
      path.join(root, '.output', 'canonical-catalogue.json'),
    ])
  })

  it('honours explicit input and output paths', () => {
    process.env.CATALOGUE_DIR = '/tmp/praetorium-input'
    process.env.CATALOGUE_CANONICAL_FILE = '/tmp/praetorium-output.json'

    expect([catalogueDataDirectory(), canonicalCatalogueOutputFile()]).toEqual(['/tmp/praetorium-input', '/tmp/praetorium-output.json'])
  })
})
