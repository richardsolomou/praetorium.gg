import { expect, it } from 'vitest'
import { dataChunks, jsonPayloads } from './battlebaseData'

it('reads the army data chunks the app names, oldest data first and its current data last', () => {
  const main =
    'r.u=e=>"static/js/"+({148:"rosterData-20260917",541:"rosterData-20260826",701:"RosterDataLazyComponent",943:"root"}[e]||e)+"."+{148:"1062e187",541:"796dca90",701:"82d40ad0",943:"7685b7a2"}[e]+".chunk.js"'
  expect(dataChunks(main)).toEqual([
    '/static/js/rosterData-20260826.796dca90.chunk.js',
    '/static/js/rosterData-20260917.1062e187.chunk.js',
    '/static/js/root.7685b7a2.chunk.js',
  ])
})

it('decodes a JSON.parse payload with the escapes a minified script writes, without running it', () => {
  const script = String.raw`e.exports=JSON.parse('{"name":"Ka\'Bandha","body":"• 1 model\\nline","x":"\x41"}');alert(1)`
  expect(jsonPayloads(script)).toEqual([{ name: "Ka'Bandha", body: '• 1 model\nline', x: 'A' }])
})
