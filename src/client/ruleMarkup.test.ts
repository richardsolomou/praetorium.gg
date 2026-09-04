import { describe, expect, it } from 'vitest'
import { parseRuleMarkup, type RuleInline } from './ruleMarkup'

const text = (content: RuleInline[]): string =>
  content.map((inline) => (inline.kind === 'text' || inline.kind === 'reference' ? inline.text : text(inline.children))).join('')

const paragraphs = (markup: string) => parseRuleMarkup(markup).flatMap((block) => (block.kind === 'paragraph' ? [text(block.content)] : []))

describe('reading a rule’s prose', () => {
  it('breaks a paragraph where the source breaks a line', () => {
    expect(paragraphs('The first thing.\n\nThe second thing.')).toEqual(['The first thing.', 'The second thing.'])
  })

  it('breaks a paragraph on one newline too, which is how the source writes them', () => {
    expect(paragraphs('The first thing.\nThe second thing.')).toEqual(['The first thing.', 'The second thing.'])
  })

  it('keeps a line the source wrapped inside emphasis whole', () => {
    expect(paragraphs('You <b>must make a\nroll</b> for it.')).toEqual(['You must make a roll for it.'])
  })

  it('reads emphasis as emphasis rather than as the tag around it', () => {
    const [block] = parseRuleMarkup('Units that <b>remain stationary</b> do <u>not</u> move.')
    expect(block).toEqual({
      kind: 'paragraph',
      content: [
        { kind: 'text', text: 'Units that ' },
        { kind: 'strong', children: [{ kind: 'text', text: 'remain stationary' }] },
        { kind: 'text', text: ' do ' },
        { kind: 'underline', children: [{ kind: 'text', text: 'not' }] },
        { kind: 'text', text: ' move.' },
      ],
    })
  })

  it('reads a keyword as a keyword', () => {
    const [block] = parseRuleMarkup('An <k>[ASSAULT]</k> weapon.')
    expect(block).toMatchObject({ content: [{}, { kind: 'keyword', children: [{ kind: 'text', text: '[ASSAULT]' }] }, {}] })
  })

  it('reads nested emphasis without losing either', () => {
    const [block] = parseRuleMarkup('<i><b>Example:</b> a model moves.</i>')
    expect(block).toEqual({
      kind: 'paragraph',
      content: [
        {
          kind: 'emphasis',
          children: [
            { kind: 'strong', children: [{ kind: 'text', text: 'Example:' }] },
            { kind: 'text', text: ' a model moves.' },
          ],
        },
      ],
    })
  })

  it('leaves words in angle brackets as the words the rule prints', () => {
    expect(paragraphs('Make a <move type> move.')).toEqual(['Make a <move type> move.'])
  })

  it('leaves a tag it does not read as the text around it', () => {
    expect(paragraphs('A <span>plain</span> sentence.')).toEqual(['A <span>plain</span> sentence.'])
  })

  it('closes a tag the source left open rather than losing the rest of the rule', () => {
    expect(paragraphs('An <b>unfinished sentence.')).toEqual(['An unfinished sentence.'])
  })

  it('reads through a tag that only marks where a rule is written down', () => {
    expect(paragraphs('One of: <appref><b>Leap to Defend</b></appref>: do it.')).toEqual(['One of: Leap to Defend: do it.'])
  })

  it('reads nothing from nothing', () => {
    expect(parseRuleMarkup('')).toEqual([])
  })
})

describe('the Markdown the source mixes into its tags', () => {
  it('reads bold', () => {
    const [block] = parseRuleMarkup('The **Designer’s Note:** applies.')
    expect(block).toMatchObject({ content: [{}, { kind: 'strong', children: [{ text: 'Designer’s Note:' }] }, {}] })
  })

  it('reads italic', () => {
    const [block] = parseRuleMarkup('Rolls are *modified* first.')
    expect(block).toMatchObject({ content: [{}, { kind: 'emphasis', children: [{ text: 'modified' }] }, {}] })
  })

  it('reads emphasis inside emphasis, which is how it writes its examples', () => {
    const [block] = parseRuleMarkup('Five ***attack dice*** are gathered.')
    expect(block).toEqual({
      kind: 'paragraph',
      content: [
        { kind: 'text', text: 'Five ' },
        { kind: 'strong', children: [{ kind: 'emphasis', children: [{ kind: 'text', text: 'attack dice' }] }] },
        { kind: 'text', text: ' are gathered.' },
      ],
    })
  })

  it('reads each of a run of emphasised terms on one line', () => {
    expect(paragraphs('Unit ***A*** is ***fully visible*** to unit ***E***.')).toEqual(['Unit A is fully visible to unit E.'])
    const [block] = parseRuleMarkup('Unit ***A*** is ***fully visible*** to unit ***E***.')
    expect(block?.kind === 'paragraph' && block.content.filter((inline) => inline.kind === 'strong')).toHaveLength(3)
  })

  it('reads emphasis beside the tags the source also uses', () => {
    const [block] = parseRuleMarkup('This <k>Vehicle</k> has a ***starting strength*** of 1.')
    expect(block).toMatchObject({ content: [{}, { kind: 'keyword' }, {}, { kind: 'strong' }, {}] })
  })

  it('leaves a marker the source hangs a footnote off as the character it printed', () => {
    expect(paragraphs('* The unit limit for Battleline units is double.')).toEqual(['* The unit limit for Battleline units is double.'])
  })

  it('leaves a lone marker inside a sentence alone', () => {
    expect(paragraphs('Both models here can move a ** of 6".')).toEqual(['Both models here can move a ** of 6".'])
  })

  it('leaves a marker that opens with three and closes with one alone', () => {
    expect(paragraphs('**In addition, you can gain a maximum of 20VP per card.*')).toEqual([
      '**In addition, you can gain a maximum of 20VP per card.*',
    ])
  })

  it('never pairs markers across the lines between them', () => {
    expect(paragraphs('** Moves 6" in a straight line\n\n** Rotates')).toEqual(['** Moves 6" in a straight line', '** Rotates'])
  })

  it('reads consecutive bullet lines as one list', () => {
    const blocks = parseRuleMarkup('That unit:\n\n- Must make one hazard roll.\n- Must make a battle-shock roll.')
    expect(blocks.map((block) => block.kind)).toEqual(['paragraph', 'list'])
    expect(blocks[1]).toMatchObject({ items: [[{ content: [{ text: 'Must make one hazard roll.' }] }], [{}]] })
  })

  it('reads a bullet whose line carries a tag as well', () => {
    const [, list] = parseRuleMarkup('That unit:\n- Must make one <b>hazard roll</b> for each model.')
    expect(list).toMatchObject({ kind: 'list', items: [[{ content: [{ text: 'Must make one ' }, { kind: 'strong' }, {}] }]] })
  })

  it('leaves a dash inside a sentence out of it', () => {
    expect(parseRuleMarkup('Rapid - Tactical Disembark: 3"').map((block) => block.kind)).toEqual(['paragraph'])
  })
})

describe('a number one rule quotes in another', () => {
  it('marks the number apart from the sentence', () => {
    const [block] = parseRuleMarkup('Units can shoot using assault shooting (10.05).')
    expect(block).toEqual({
      kind: 'paragraph',
      content: [
        { kind: 'text', text: 'Units can shoot using assault shooting ' },
        { kind: 'reference', code: '10.05', text: '(10.05)' },
        { kind: 'text', text: '.' },
      ],
    })
  })

  it('marks a clarification’s longer number too', () => {
    const [block] = parseRuleMarkup('See rules sequencing (01.03.02).')
    expect(block).toMatchObject({ content: [{}, { kind: 'reference', code: '01.03.02' }, {}] })
  })

  it('leaves a bracketed number that is not a rule alone', () => {
    expect(paragraphs('Roll one D6 (1).')).toEqual(['Roll one D6 (1).'])
  })
})

describe('a list a rule prints', () => {
  it('reads each bullet as its own item', () => {
    const [list] = parseRuleMarkup('<ul><li>Through friendly models.</li><li>Not through enemy models.</li></ul>')
    expect(list).toEqual({
      kind: 'list',
      items: [
        [{ kind: 'paragraph', content: [{ kind: 'text', text: 'Through friendly models.' }] }],
        [{ kind: 'paragraph', content: [{ kind: 'text', text: 'Not through enemy models.' }] }],
      ],
    })
  })

  it('keeps the prose before a list apart from the list', () => {
    expect(parseRuleMarkup('Stated:<ul><li>One</li></ul>').map((block) => block.kind)).toEqual(['paragraph', 'list'])
  })

  it('reads a list inside a bullet as a list', () => {
    const [list] = parseRuleMarkup('<ul><li>Either:<ul><li>This</li></ul></li></ul>')
    expect(list).toMatchObject({ items: [[{ kind: 'paragraph' }, { kind: 'list' }]] })
  })

  it('reads a sub-list written beside its bullet as part of that bullet', () => {
    const [list] = parseRuleMarkup('<ul><li>Each time it attacks:</li><ul><li>Subtract 1.</li></ul></ul>')
    expect(list).toMatchObject({ items: [[{ kind: 'paragraph' }, { kind: 'list', items: [[{ kind: 'paragraph' }]] }]] })
  })

  it('reads a sentence the source left loose in a list it never closed', () => {
    expect(paragraphs('<ul><li>A bullet.</li>\n\nA sentence after it.')).toEqual(['A sentence after it.'])
  })
})

describe('a table a rule prints', () => {
  it('reads a header row as headings', () => {
    const [table] = parseRuleMarkup('<table><tr><th>D6</th><th>Result</th></tr><tr><td>1</td><td>Nothing</td></tr></table>')
    expect(table).toEqual({
      kind: 'table',
      rows: [
        [
          { header: true, content: [{ kind: 'text', text: 'D6' }] },
          { header: true, content: [{ kind: 'text', text: 'Result' }] },
        ],
        [
          { header: false, content: [{ kind: 'text', text: '1' }] },
          { header: false, content: [{ kind: 'text', text: 'Nothing' }] },
        ],
      ],
    })
  })

  it('reads the rows of a table written with a body', () => {
    const [table] = parseRuleMarkup('<table>\n  <tbody>\n    <tr>\n      <td>1</td>\n    </tr>\n  </tbody>\n</table>')
    expect(table).toMatchObject({ rows: [[{ header: false, content: [{ kind: 'text', text: '1' }] }]] })
  })
})
