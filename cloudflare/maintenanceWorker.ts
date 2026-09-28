export default {
  fetch() {
    return new Response('Praetorium is briefly unavailable while account data moves to the new server.', {
      status: 503,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'retry-after': '60',
        'x-praetorium-maintenance': 'auth-cutover',
      },
    })
  },
}
