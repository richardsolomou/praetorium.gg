import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

const read = (file: string) => readFileSync(path.join(import.meta.dirname, '..', file), 'utf8')
const mise = (tool: string) => new RegExp(`^${tool} = "([^"]+)"$`, 'm').exec(read('mise.toml'))?.[1]
const dockerfile = read('.devcontainer/Dockerfile')

it('the dev container runs the Node version mise.toml pins', () => {
  expect(/^FROM node:([^-\s]+)-/m.exec(dockerfile)?.[1]).toBe(mise('node'))
})

it('the dev container installs the just version mise.toml pins', () => {
  expect(new Set([...dockerfile.matchAll(/casey\/just\/releases\/download\/([^/]+)\//g)].map((match) => match[1]))).toEqual(
    new Set([mise('just')]),
  )
})
