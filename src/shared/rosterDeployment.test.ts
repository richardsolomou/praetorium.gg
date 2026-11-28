import { expect, it } from 'vitest'
import { deploymentRules } from './rosterDeployment'

it('reads Deep Strike from the core abilities VS Data records over the datasheet names', () =>
  expect(deploymentRules(['Deep Strike'], { own: [], granted: [] }).formationOptions).toEqual([]))

it('keeps a deployment ability something else gives the unit', () =>
  expect(deploymentRules(['Infiltrators'], { own: [], granted: ['Infiltrators'] }).prebattleRules).toEqual(['infiltrators']))

it('leaves out a core ability only some of the models have', () =>
  expect(deploymentRules([], { own: [{ ability: 'scouts', inches: 6, models: ['sergeant'] }], granted: [] }).prebattleRules).toEqual([]))
