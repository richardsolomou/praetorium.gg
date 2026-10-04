import { createFileRoute } from '@tanstack/react-router'
import { version } from '../../../package.json'

export const Route = createFileRoute('/api/release')({
  server: { handlers: { GET: () => Response.json({ version }, { headers: { 'cache-control': 'no-store' } }) } },
})
