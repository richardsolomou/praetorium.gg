import { expect, it } from 'vitest'
import { datasheetPageBySlug, datasheetSlugFor } from './datasheetSlug'

const master = { id: 'd7e1-13bb-2177-b6bc', slug: 'watch-master' }
const suffixedMaster = { ...master, slug: 'watch-master-d7e1-13b' }
const otherMaster = { id: '155b-1e42-3f86-598c', slug: 'watch-master-155b-1e4' }

it('suffixes a slug with the id prefix only while the name is shared', () => {
  expect([datasheetSlugFor('watch-master', master.id, false), datasheetSlugFor('watch-master', master.id, true)]).toEqual([
    'watch-master',
    'watch-master-d7e1-13b',
  ])
})

it('finds a page by its current slug', () => {
  expect(datasheetPageBySlug([suffixedMaster, otherMaster], 'watch-master-d7e1-13b')).toBe(suffixedMaster)
})

it('finds a page by its entry id', () => {
  expect(datasheetPageBySlug([master], 'd7e1-13bb-2177-b6bc')).toBe(master)
})

it('finds a page by its suffixed slug after its name stops being shared', () => {
  expect(datasheetPageBySlug([master], 'watch-master-d7e1-13b')).toBe(master)
})

it('finds a page by its plain slug after its name becomes shared', () => {
  expect(datasheetPageBySlug([suffixedMaster], 'watch-master')).toBe(suffixedMaster)
})

it('finds nothing for a plain slug several pages share', () => {
  expect(datasheetPageBySlug([suffixedMaster, otherMaster], 'watch-master')).toBeNull()
})

it('does not take an id suffix from another datasheet name', () => {
  expect(datasheetPageBySlug([master], 'corvus-blackstar-d7e1-13b')).toBeNull()
})

it('finds nothing for an unknown slug', () => {
  expect(datasheetPageBySlug([master], 'watch-captain')).toBeNull()
})

it('finds a page by its plain slug when only copies of it share the name', () => {
  expect(datasheetPageBySlug([suffixedMaster, { ...suffixedMaster }], 'watch-master')).toBe(suffixedMaster)
})

it('finds a page by the name in a suffixed slug whose id has since changed', () => {
  expect(datasheetPageBySlug([{ id: 'c2f2-66e0-1a2b-3c4d', slug: 'watch-master' }], 'watch-master-d7e1-13b')?.id).toBe(
    'c2f2-66e0-1a2b-3c4d',
  )
})

it('finds nothing for a suffixed slug whose id has changed when several pages share its name', () => {
  expect(datasheetPageBySlug([suffixedMaster, otherMaster], 'watch-master-aaaa-bbb')).toBeNull()
})

it('keeps a name that only looks like it ends in an id suffix', () => {
  expect(datasheetPageBySlug([{ id: 'beef-0000-0000-0000', slug: 'squad' }], 'squad-dead-beef')).toBeNull()
})

it('finds a page by the name in a suffixed slug taken from a shorter id group', () => {
  expect(datasheetPageBySlug([{ id: '9a1-0c2d-3e4f-5a6b', slug: 'tactical-squad' }], 'tactical-squad-48b-3ef7')?.id).toBe(
    '9a1-0c2d-3e4f-5a6b',
  )
})
