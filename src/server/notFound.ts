export const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
