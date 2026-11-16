import { expect, it } from 'vitest'
import { englishNames } from './catalogueTranslations'

it("matches another builder's translation that differs only in a plural, accents or word order", () => {
  const translations = new Map([['Skorpekh Destroyers', ['Destroyers Skorpekh']]])
  expect(englishNames('Destroyers Skorpekhs', translations)).toEqual(['Skorpekh Destroyers'])
})
