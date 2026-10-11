import { expect, it } from 'vitest'
import { restoreReferenceText, shareReferenceText } from './sharedReferenceText'

it('shares repeated rules prose while retaining edition-specific points and names', () => {
  const description = 'Each time this unit makes a ranged attack, re-roll a Hit roll of 1. '.repeat(10)
  const rules = [
    { name: 'Previous rules', points: 80, description },
    { name: 'Current rules', points: 90, description },
  ]
  const shared = shareReferenceText(rules)
  expect({
    restored: restoreReferenceText(shared.value, shared.texts),
    smaller: JSON.stringify(shared).length < JSON.stringify(rules).length,
  }).toEqual({ restored: rules, smaller: true })
})

it.each([-1, 1, 0.5, '0'])('refuses an unavailable text reference %j', (index) => {
  expect(() => restoreReferenceText({ $praetoriumText: index }, ['Rule'])).toThrow('Invalid reference text')
})

it('refuses a text reference with additional fields', () => {
  expect(() => restoreReferenceText({ $praetoriumText: 0, name: 'Other' }, ['Rule'])).toThrow('Invalid reference text')
})

it('refuses source content using the reserved text reference field', () => {
  expect(() => shareReferenceText({ $praetoriumText: 0 })).toThrow('Reserved reference-text field')
})

it('bounds deeply nested reference content', () => {
  const value = Array.from({ length: 65 }).reduce<unknown>((child) => [child], 'Rule')
  expect(() => shareReferenceText(value)).toThrow('too deeply nested')
})
