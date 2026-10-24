import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it.each(['./features/simulator/combat.worker.ts', './offline/construction.worker.ts'])(
  '%s supports array copies in an older worker runtime',
  (entry) => {
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
          for (const name of ['toSorted', 'toReversed', 'toSpliced', 'with']) delete Array.prototype[name]
          globalThis.self = globalThis
          await import(${JSON.stringify(new URL(entry, import.meta.url).href)})
          const source = [3, 1, 2]
          console.log(JSON.stringify({
            sorted: source.toSorted(),
            reversed: source.toReversed(),
            spliced: source.toSpliced(1, 1, 4),
            replaced: source.with(1, 4),
            source,
          }))
        `,
      ],
      { encoding: 'utf8' },
    )
    expect(JSON.parse(output)).toEqual({
      sorted: [1, 2, 3],
      reversed: [2, 1, 3],
      spliced: [3, 4, 2],
      replaced: [3, 4, 2],
      source: [3, 1, 2],
    })
  },
)
