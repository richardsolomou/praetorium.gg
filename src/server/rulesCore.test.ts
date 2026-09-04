import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadRuleDocuments, ruleIndexOf, ruleSectionOf } from './rulesCore'

let directory: string

const write = (file: string, value: unknown) => fs.writeFileSync(file, JSON.stringify(value))

const language = (value: string) => ({ en: value, de: 'nicht gelesen' })

/** A rules document small enough to read, shaped exactly like the real ones. */
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-rules-core-'))
  const core = path.join(directory, 'core')
  fs.mkdirSync(core, { recursive: true })
  write(path.join(core, 'core_rules.json'), {
    id: 'core-rules-document',
    name: language('Core Rules'),
    cardType: 'coreRules',
    updated: '2026-09-02T09:15:45.184Z',
    sections: [
      {
        id: 'section-moving',
        name: language('03. Moving'),
        order: 1,
        containers: [
          {
            id: 'container-moving-units',
            type: 'standard',
            order: 1,
            title: language('Moving Units'),
            subTitle: language('03.01'),
            components: [
              { order: 2, type: 'accordion', title: language('03.01.01 - Rotating a Model'), text: language('Rotation is a move.') },
              { order: 0, type: 'text', text: language('There are several types of move a unit can make.') },
              { order: 3, type: 'image', imageUrl: 'https://example.invalid/diagram' },
              { order: 1, type: 'header', text: language('Moving In A Straight Line') },
            ],
          },
          {
            id: 'container-moving',
            type: 'introduction',
            order: 0,
            title: language('Moving'),
            subTitle: language('03.00'),
            components: [{ order: 0, type: 'text', text: language('The principles of movement are explained here.') }],
          },
        ],
      },
      {
        id: 'section-movement-phase',
        name: language('09. Movement Phase'),
        order: 2,
        containers: [
          {
            id: 'container-remain-stationary',
            type: 'behaviourType',
            order: 0,
            title: language('Remain Stationary'),
            subTitle: language('09.04'),
            behaviour: {
              id: 'behaviour-remain-stationary',
              name: language('Remain Stationary'),
              effect: language('No models are moved.'),
              eligibleIf: language('Any unit.'),
              maximumDistance: language("'-'"),
              afterMoving: language('Nothing happens.'),
              ruleReference: language('09.04'),
              somethingNew: language('An answer this app has never heard of.'),
            },
            components: [],
          },
          {
            id: 'container-rotating-again',
            type: 'standard',
            order: 2,
            title: language('Rotating a Model'),
            subTitle: language('03.01.01'),
            components: [{ order: 0, type: 'text', text: language('Said again under its own number.') }],
          },
          {
            id: 'container-command-re-roll',
            type: 'stratagem',
            order: 1,
            title: language('Command Re-Roll'),
            subTitle: language('09.05'),
            stratagem: {
              id: 'stratagem-command-re-roll',
              cost: 1,
              when: 'Any phase, just after you make a roll.',
              target: 'That unit or model.',
              effect: 'You re-roll that roll.',
              lore: 'A great commander can bend fate.',
            },
            components: [],
          },
        ],
      },
    ],
  })
})

const load = () => loadRuleDocuments(directory)

describe('reading a rules document', () => {
  it('reads every document the snapshot holds', () => {
    expect(load().map((document) => document.slug)).toEqual(['core-rules'])
  })

  it('skips a file that does not declare itself a rules document', () => {
    write(path.join(directory, 'core', 'keywords.json'), { id: 'keywords', name: language('Keywords'), cardType: 'keywords' })
    expect(load()).toHaveLength(1)
  })

  it('reads the core rules first, because the other documents amend them', () => {
    write(path.join(directory, 'core', 'chapter_approved.json'), {
      id: 'chapter-approved-document',
      name: language('Chapter Approved'),
      cardType: 'coreRules',
      sections: [
        {
          id: 'section-mission-sequence',
          name: language('Mission Sequence'),
          containers: [
            { id: 'container-muster', title: language('Muster Armies'), components: [{ type: 'text', text: language('Muster.') }] },
          ],
        },
      ],
    })
    expect(load().map((document) => document.slug)).toEqual(['core-rules', 'chapter-approved'])
  })

  it('orders sections by the number the source prints them under', () => {
    expect(load()[0]?.sections.map((section) => section.title)).toEqual(['03. Moving', '09. Movement Phase'])
  })

  it('addresses a section by its name without the number', () => {
    expect(load()[0]?.sections.map((section) => section.slug)).toEqual(['moving', 'movement-phase'])
  })

  it('orders the rules in a section by the number the source prints them under', () => {
    expect(load()[0]?.sections[0]?.entries.map((entry) => entry.code)).toEqual(['03.00', '03.01'])
  })

  it('orders a rule’s own prose, headings and clarifications as the source does', () => {
    expect(load()[0]?.sections[0]?.entries[1]?.blocks.map((block) => block.kind)).toEqual(['prose', 'heading', 'clarification'])
  })

  it('leaves the printed rulebook photography out', () => {
    const blocks = load()[0]?.sections[0]?.entries[1]?.blocks ?? []
    expect(blocks.some((block) => JSON.stringify(block).includes('example.invalid'))).toBe(false)
  })

  it('names a clarification by its title without the number in front of it', () => {
    const clarification = (load()[0]?.sections[0]?.entries[1]?.blocks ?? []).find((block) => block.kind === 'clarification')
    expect(clarification).toMatchObject({ code: '03.01.01', title: 'Rotating a Model' })
  })
})

describe('what a rule states beside its prose', () => {
  const entry = (code: string) =>
    load()
      .flatMap((document) => document.sections)
      .flatMap((section) => section.entries)
      .find((candidate) => candidate.code === code)

  it('labels each field the way the source names it', () => {
    expect(entry('09.04')?.facts.map((fact) => fact.label)).toEqual(['Eligible if', 'After moving', 'Effect', 'Something new'])
  })

  it('omits a field the source states only as a dash', () => {
    expect(entry('09.04')?.facts.some((fact) => fact.label === 'Maximum distance')).toBe(false)
  })

  it('reads what a core stratagem costs', () => {
    expect(entry('09.05')?.cost).toBe(1)
  })

  it('reads a core stratagem in the order it is printed', () => {
    expect(entry('09.05')?.facts.map((fact) => fact.label)).toEqual(['When', 'Target', 'Effect'])
  })

  it('keeps the lore apart from what the stratagem does', () => {
    expect(entry('09.05')?.lore).toBe('A great commander can bend fate.')
  })
})

describe('the rule numbers a page answers to', () => {
  it('gives every rule and clarification an address of its own', () => {
    const anchors = load()
      .flatMap((document) => document.sections)
      .flatMap((section) => section.entries)
      .flatMap((entry) => [entry.anchor, ...entry.blocks.flatMap((block) => (block.kind === 'clarification' ? [block.anchor] : []))])
    expect(new Set(anchors).size).toBe(anchors.length)
  })

  it('numbers a second rule off an address another rule has already claimed', () => {
    // The real core rules do this once: a clarification and a rule print one number.
    const later = load()[0]?.sections[1]?.entries.find((entry) => entry.code === '03.01.01')
    expect(later?.anchor).toBe('03.01.01-2')
  })

  it('links a quoted number to the rule that prints it', () => {
    expect(ruleIndexOf(load()).references).toContainEqual({
      code: '03.01.01',
      title: 'Rotating a Model',
      anchor: '03.01.01',
      document: 'core-rules',
      section: 'moving',
    })
  })

  it('keeps each document’s own numbers apart', () => {
    write(path.join(directory, 'core', 'combat_patrol.json'), {
      id: 'combat-patrol-document',
      name: language('Combat Patrol'),
      cardType: 'coreRules',
      sections: [
        {
          id: 'section-combat-patrol',
          name: language('01. Combat Patrol Mission Sequence'),
          containers: [
            {
              id: 'container-combat-patrol-moving',
              title: language('Moving Units'),
              subTitle: language('03.01'),
              components: [{ type: 'text', text: language('Combat Patrol says its own thing.') }],
            },
          ],
        },
      ],
    })
    const references = ruleIndexOf(load()).references.filter((reference) => reference.code === '03.01')
    expect(references.map((reference) => reference.document)).toEqual(['core-rules', 'combat-patrol'])
  })
})

describe('finding one section', () => {
  it('returns the section a document holds under that name', () => {
    expect(ruleSectionOf(load(), 'core-rules', 'moving')?.section.title).toBe('03. Moving')
  })

  it('returns nothing for a section the document does not hold', () => {
    expect(ruleSectionOf(load(), 'core-rules', 'shooting-phase')).toBeNull()
  })
})

describe('a snapshot without rules documents', () => {
  it('reads none rather than failing', () => {
    expect(loadRuleDocuments(fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-rules-empty-')))).toEqual([])
  })
})
