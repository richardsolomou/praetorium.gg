import { expect, it } from 'vitest'
import { fetchProductionRostersOverSsh } from './productionRosterSsh'

it('refuses SSH options disguised as a host', async () => {
  await expect(fetchProductionRostersOverSsh('-oProxyCommand=touch', 'web-production')).rejects.toThrow('Invalid production SSH host')
})

it('refuses shell syntax in a remote service name', async () => {
  await expect(fetchProductionRostersOverSsh('production', 'web; touch /tmp/injected')).rejects.toThrow('Invalid production web service')
})
