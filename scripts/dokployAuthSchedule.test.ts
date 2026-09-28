import { expect, it, vi } from 'vitest'
import { verifyProductionAuthBackup } from './dokployAuthSchedule'

const environment = {
  DOKPLOY_URL: 'https://dokploy.example/',
  DOKPLOY_APPLICATION_ID: 'production-web',
  DOKPLOY_ENVIRONMENT_ID: 'production',
  DOKPLOY_API_KEY: 'secret',
}

it('creates and runs an hourly backup against the selected production app', async () => {
  const calls: string[] = []
  const request = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    if (!(input instanceof URL)) throw new Error('Expected a URL')
    const url = input
    calls.push(url.pathname)
    if (url.pathname.endsWith('application.one')) {
      return Response.json({ applicationId: 'production-web', environmentId: 'production', name: 'web' })
    }
    if (url.pathname.endsWith('schedule.list')) return Response.json([])
    if (url.pathname.endsWith('schedule.create')) {
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON body')
      expect(JSON.parse(init.body)).toMatchObject({
        command: 'node scripts/nodeAuthBackup.ts backup /data/auth.sqlite production',
        cronExpression: '17 * * * *',
      })
      return Response.json({ scheduleId: 'backup' })
    }
    return Response.json({ status: 'done' })
  }) as typeof fetch
  await verifyProductionAuthBackup(environment, request)
  expect(calls).toEqual(['/api/application.one', '/api/schedule.list', '/api/schedule.create', '/api/schedule.runManually'])
})

it('fails the release when the backup does not finish', async () => {
  const request = vi.fn(async (input: URL | RequestInfo) => {
    if (!(input instanceof URL)) throw new Error('Expected a URL')
    const url = input
    if (url.pathname.endsWith('application.one')) {
      return Response.json({ applicationId: 'production-web', environmentId: 'production', name: 'web' })
    }
    if (url.pathname.endsWith('schedule.list')) return Response.json([])
    if (url.pathname.endsWith('schedule.create')) return Response.json({ scheduleId: 'backup' })
    return Response.json({ status: 'error' })
  }) as typeof fetch
  await expect(verifyProductionAuthBackup(environment, request)).rejects.toThrow('backup and restore verification failed')
})
