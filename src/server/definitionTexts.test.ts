import { describe, expect, it } from 'vitest'
import type { CatalogueFile } from '../core/catalogue'
import { textKey, textToken, textTokensIn } from '../core/sourceText'
import { definitionTexts } from './definitionTexts'

const words = 'This model has a 4+ invulnerable save. Each time this model makes an attack, re-roll a Hit roll of 1.'
const file = {
  catalogue: {
    id: 'book',
    name: 'Book',
    sharedProfiles: [
      { id: 'ability', name: 'Warded', typeName: 'Abilities', characteristics: [{ name: 'Description', typeId: 'd', $text: words }] },
    ],
  },
} as unknown as CatalogueFile
const card = textToken({ file: '0123abcd', transform: 'prose', hash: '0123456789abcdef' })
const keyOf = (token: string) => textKey(textTokensIn(token)[0]!)

describe('a catalogue text shown as its card twin', () => {
  const texts = definitionTexts([{ file, path: 'definitions/book.json' }])
  const own = texts.token(words)!
  const shown = texts.withTwins(new Map([[keyOf(own), { own, token: card, references: [] }]]))

  it('shows the card token in place of its own', () => {
    expect(JSON.stringify(shown.files[0]!.file)).toContain(card)
  })

  it('answers every rule with the catalogue text’s facts', () => {
    expect(shown.fact(keyOf(card))).toEqual({ ...texts.fact(keyOf(own)), reminder: { timings: [] } })
  })
})
