import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRODUCT_DOCS } from '../../../contracts/productDocs'
import { headings } from './docsOutline'
import { screenshotSizesJson } from './screenshotSizes'

const directory = 'src/client/features/docs'
const markdown = new Map<string, string>(PRODUCT_DOCS.map((doc) => [doc.slug, readFileSync(`${directory}/content/${doc.slug}.md`, 'utf8')]))
const all = [...markdown.values()].join('\n')
const screenshotFiles = readdirSync(`${directory}/screenshots`).filter((file) => file.endsWith('.png'))
const referenced = [...all.matchAll(/\]\(screenshot:([\w-]+)/g)].map((match) => `${match[1]}.png`)

describe('docs content', () => {
  it('names only screenshots that exist', () => expect(referenced.filter((file) => !screenshotFiles.includes(file))).toEqual([]))

  it('uses every committed screenshot', () => expect(screenshotFiles.filter((file) => !referenced.includes(file))).toEqual([]))

  it('records the size of every screenshot so the page reserves its space', () =>
    expect(readFileSync(`${directory}/screenshots/sizes.json`, 'utf8')).toBe(
      screenshotSizesJson(screenshotFiles.map((file) => [file.slice(0, -'.png'.length), readFileSync(`${directory}/screenshots/${file}`)])),
    ))

  it('links only to docs and headings that exist', () => {
    const targets = [...all.matchAll(/\]\(\/docs\/([\w-]+)(?:#([\w-]+))?\)/g)].map(([, slug, hash]) => ({ slug, hash }))
    const broken = targets.filter(({ slug, hash }) => {
      const body = markdown.get(slug!)
      return !body || (hash !== undefined && !headings(body).some((heading) => heading.id === hash))
    })
    expect(broken).toEqual([])
  })
})
