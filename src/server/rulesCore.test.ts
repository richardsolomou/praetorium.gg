import { describe, expect, it } from 'vitest'
import { vsDataRuleDocuments } from '../shared/ruleDocuments'
import type { VsDataCoreRule } from '../shared/vsData'
import { ruleIndexOf, ruleSectionOf } from './rulesCore'

const rule = (fields: Partial<VsDataCoreRule> & Pick<VsDataCoreRule, 'id' | 'name' | 'order'>): VsDataCoreRule => ({
  document: 'Core Rules',
  section: '03. Moving',
  number: null,
  parent: null,
  anchor: fields.number ?? fields.id,
  stratagem: null,
  ...fields,
})

/** A release's core rules, out of order as a release lists them, shaped as VS Data outlines the real ones. */
const rules = [
  rule({ id: 'remain-stationary', name: 'Remain Stationary', section: '09. Movement Phase', number: '09.04', order: 6 }),
  rule({ id: 'moving-units.rotating', name: 'Rotating a Model', number: '03.01.01', parent: 'moving-units', order: 3 }),
  rule({ id: 'moving-units', name: 'Moving Units', number: '03.01', order: 2 }),
  rule({ id: 'moving', name: 'Moving', number: '03.00', order: 1 }),
  rule({
    id: 'command-re-roll',
    name: 'Command Re-Roll',
    section: '09. Movement Phase',
    number: '09.05',
    stratagem: 'core.command-re-roll',
    order: 7,
  }),
  rule({
    id: 'introduction',
    name: 'Introduction',
    document: 'Chapter Approved',
    section: 'Introduction',
    anchor: 'introduction',
    order: 1,
  }),
  rule({
    id: 'combat-patrol.moving-units',
    name: 'Moving Units',
    document: 'Combat Patrol',
    section: '01. Combat Patrol Mission Sequence',
    number: '03.01',
    order: 1,
  }),
]
const documents = vsDataRuleDocuments(rules, [{ id: 'core.command-re-roll', cp: 1 }], (id) => (id === 'introduction' ? ['17b2bf26'] : []))
const core = documents[0]!

describe('a rules document from VS Data', () => {
  it('reads the core rules first, because the other documents amend them', () => {
    expect(documents.map((document) => document.slug)).toEqual(['core-rules', 'chapter-approved', 'combat-patrol'])
  })

  it('orders sections and rules as the document reads', () => {
    expect(core.sections.map((section) => section.entries.map((entry) => entry.code))).toEqual([
      ['03.00', '03.01'],
      ['09.04', '09.05'],
    ])
  })

  it('addresses a section by its name without the number', () => {
    expect(core.sections.map((section) => section.slug)).toEqual(['moving', 'movement-phase'])
  })

  it('places a clarification beneath the rule it is numbered under', () => {
    expect(core.sections[0]!.entries[1]!.clarifications).toEqual([
      { id: 'moving-units.rotating', code: '03.01.01', anchor: '03.01.01', title: 'Rotating a Model' },
    ])
  })

  it('reads what a core Stratagem costs from its release', () => {
    expect(core.sections[1]!.entries[1]!.cost).toBe(1)
  })

  it('keeps the address a rule had before as a former one', () => {
    expect(documents[1]!.sections[0]!.entries[0]!.formerAnchors).toEqual(['17b2bf26'])
  })
})

describe('the rules index', () => {
  it('links a quoted number to the clarification that prints it', () => {
    expect(ruleIndexOf(documents).references).toContainEqual({
      code: '03.01.01',
      title: 'Rotating a Model',
      anchor: '03.01.01',
      document: 'core-rules',
      section: 'moving',
    })
  })

  it('keeps each document’s own numbers apart', () => {
    const references = ruleIndexOf(documents).references.filter((reference) => reference.code === '03.01')
    expect(references.map((reference) => reference.document)).toEqual(['core-rules', 'combat-patrol'])
  })
})

describe('finding one section', () => {
  it('returns the section a document holds under that name', () => {
    expect(ruleSectionOf(documents, 'core-rules', 'moving')?.section.title).toBe('03. Moving')
  })

  it('returns nothing for a section the document does not hold', () => {
    expect(ruleSectionOf(documents, 'core-rules', 'shooting-phase')).toBeNull()
  })
})
