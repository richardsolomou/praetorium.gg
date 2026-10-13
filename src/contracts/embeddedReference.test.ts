import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { embeddedReferenceJson, referenceJsonExpression } from './embeddedReference'

it('restores a previous build’s object-literal download', () => {
  expect(embeddedReferenceJson('<script>window.PraetoriumOffline={"version":1};</script>')).toBe('{"version":1}')
})

it('embeds reference data without compiling it as a JavaScript object literal', () => {
  const json = JSON.stringify({ rules: 'Unicode …, "quotes", \\slashes and </script><script>throw 1</script>' })
  const expression = referenceJsonExpression(json)
  const parsed: string[] = []
  const window = {}
  runInNewContext(`window.PraetoriumOffline=${expression};`, {
    window,
    JSON: {
      parse: (input: string) => {
        parsed.push(input)
        return JSON.parse(input)
      },
    },
  })
  expect({ parsed, window, inlineScript: expression.includes('</script>') }).toEqual({
    parsed: [json],
    window: { PraetoriumOffline: JSON.parse(json) },
    inlineScript: false,
  })
})

it('reads JSON-parsed downloads without evaluating their script', () => {
  const json = JSON.stringify({ version: 1, name: '</script>' })
  expect(embeddedReferenceJson(`<script>window.PraetoriumOffline=${referenceJsonExpression(json)};</script>`)).toBe(json)
})

it.each(['JSON.parse({})', 'JSON.parse("broken)', 'JSON.parse("{}") ; throw 1'])('ignores invalid JSON expressions: %s', (expression) => {
  expect(embeddedReferenceJson(`<script>window.PraetoriumOffline=${expression};</script>`)).toBeNull()
})
