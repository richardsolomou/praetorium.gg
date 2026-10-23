import { createFileRoute } from '@tanstack/react-router'

// OpenAI's plugin portal issues this token to prove praetorium.gg owns the MCP server it lists.
const OPENAI_APPS_CHALLENGE = 'uCDQhT0_xju0dy7qEVr4Ebo3JYNH3nmcld9pSPFMLZg'

export const Route = createFileRoute('/.well-known/openai-apps-challenge')({
  server: { handlers: { GET: () => new Response(OPENAI_APPS_CHALLENGE, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }) } },
})
