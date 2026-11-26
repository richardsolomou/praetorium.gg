import { Link } from '@tanstack/react-router'
import { Check, Copy } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { HobbyKitCard } from '../../components/HobbyKitCard'
import { PageContent, PageHeader } from '../../components/Page'
import { SectionHeading } from '../../components/SectionHeading'
import { ANDROID_BETA, MCP_SERVER } from '../../projectLinks'
import { useCopyText } from '../../useCopyText'
import { OUTLINE_TAG } from '../../components/rosterSetup'
import { AndroidBeta, AppStoreBadge, ASSISTANTS, AssistantButton, HomeAppCredits } from '../home/HomeApps'

const linkClass = 'text-sm text-info hover:text-parchment'

function AppTile({ title, beta = false, children, help }: { title: string; beta?: boolean; children: ReactNode; help: ReactNode }) {
  return (
    <article className="flex flex-col gap-3 border-b border-edge py-5">
      <h3 className="flex items-center gap-2 text-lg leading-tight font-semibold text-bone">
        <span>{title}</span>
        {beta ? <span className={`${OUTLINE_TAG} border-parchment/50 text-sm font-normal text-parchment`}>Beta</span> : null}
      </h3>
      {children}
      <p className="mt-auto pt-1">{help}</p>
    </article>
  )
}

function McpAddress() {
  const { copy, copied, problem } = useCopyText()
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-edge bg-void/60 px-2.5 py-2 text-xs">{MCP_SERVER}</code>
        <Button
          size="icon"
          variant="outline"
          aria-label={copied ? 'Address copied' : 'Copy address'}
          onClick={() => void copy(MCP_SERVER, { failure: 'Copy failed. Select the address instead.', operation: 'copy mcp address' })}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </div>
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
    </div>
  )
}

/** Where to find Praetorium outside the browser; the steps for each live in the docs, so this page only points. */
export function AppsPage() {
  return (
    <main className="w-full">
      <PageHeader
        title="Apps"
        description="Take Praetorium to the table on your phone, or ask your AI assistant about units, points and missions."
      />
      <PageContent className="grid content-start gap-10">
        {/* Inside the app there is nothing to install. */}
        <section data-store-link aria-labelledby="apps-phone">
          <SectionHeading id="apps-phone" title="On your phone" />
          <div className="grid border-t border-edge sm:grid-cols-2 sm:gap-x-8">
            <AppTile
              title="iPhone, iPad and Apple Watch"
              help={
                <Link to="/docs/$docId" params={{ docId: 'mobile-app' }} className={linkClass}>
                  What the app does
                </Link>
              }
            >
              <p className="text-sm text-dim">
                Your rosters and battles, with the reference and simulator still working offline. The watch follows your live battle.
              </p>
              <AppStoreBadge />
            </AppTile>
            {ANDROID_BETA ? (
              <AppTile
                title="Android"
                beta
                help={
                  <Link to="/docs/$docId" params={{ docId: 'mobile-app' }} hash="get-the-app" className={linkClass}>
                    Joining the beta
                  </Link>
                }
              >
                <p className="text-sm text-dim">The same app, in a closed test on Google Play. Joining takes three steps.</p>
                <div className="w-fit">
                  <AndroidBeta beta={ANDROID_BETA} />
                </div>
              </AppTile>
            ) : null}
          </div>
        </section>
        <section aria-labelledby="apps-assistants">
          <SectionHeading id="apps-assistants" title="In your AI assistant" />
          <p className="mb-3 max-w-2xl text-sm text-dim">
            Ask about units, points, detachments and missions, plan a list, or run the simulator. You sign in only when it needs your
            rosters or battles.
          </p>
          <div className="grid border-t border-edge sm:grid-cols-2 sm:gap-x-8">
            {[ASSISTANTS.chatgpt, ASSISTANTS.claude].map((assistant) => (
              <AppTile
                key={assistant.name}
                title={assistant.name}
                help={
                  <Link
                    to="/docs/$docId"
                    params={{ docId: 'connect-an-assistant' }}
                    hash={assistant.name.toLowerCase()}
                    className={linkClass}
                  >
                    Setting up {assistant.name}
                  </Link>
                }
              >
                <p className="text-sm text-dim">
                  Listed in {assistant.name}’s {assistant.name === 'Claude' ? 'connector' : 'plugin'} directory.
                </p>
                <AssistantButton assistant={assistant} className="w-fit" />
              </AppTile>
            ))}
            <AppTile
              title="Gemini"
              help={
                <Link to="/docs/$docId" params={{ docId: 'connect-an-assistant' }} hash="gemini" className={linkClass}>
                  Setting up Gemini
                </Link>
              }
            >
              <p className="text-sm text-dim">
                Add Praetorium as a custom app in the Gemini web app’s settings, then use it on your phone too.
              </p>
            </AppTile>
            <AppTile
              title="Other assistants"
              help={
                <Link to="/docs/$docId" params={{ docId: 'connect-an-assistant' }} hash="other-assistants" className={linkClass}>
                  Connection details
                </Link>
              }
            >
              <p className="text-sm text-dim">Any assistant that takes a remote MCP server can use this address, with no API key.</p>
              <McpAddress />
            </AppTile>
          </div>
        </section>
        <section aria-labelledby="apps-maker">
          <SectionHeading id="apps-maker" title="From the same maker" />
          <HobbyKitCard
            primary
            title="HobbyKit"
            description="A free, open-source side project for 3D-printing bases, army holders, spray trays and paint racks."
            links={[{ label: 'Open HobbyKit', to: '/' }]}
          />
        </section>
      </PageContent>
      <HomeAppCredits dismissable={false} className="max-w-5xl px-3 sm:px-4" />
    </main>
  )
}
