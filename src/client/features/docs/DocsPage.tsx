import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, ChevronRight, Link2, TriangleAlert } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import Markdown, { type Components, defaultUrlTransform, type ExtraProps } from 'react-markdown'
import { DOC_SECTIONS, PRODUCT_DOCS, type ProductDoc } from '../../../contracts/productDocs'
import { buttonClass } from '../../components/buttonClass'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/Dialog'
import { PageContent, PageHeader } from '../../components/Page'
import { DISCORD } from '../../projectLinks'
import { AREAS, body, bySection, proseLink, troubleshooting } from './docsLibrary'
import { PROBLEMS, slug } from './docsOutline'
import { DocsSearchField, DocsSearchResults, FeedbackLink } from './DocsSearch'
import { SCREENSHOT_SCALE } from './screenshotSizes'
import sizes from './screenshots/sizes.json'

/** Screenshots captured by `e2e/docsScreenshots.ts`, named in docs as `screenshot:<name>`. */
const screenshots = import.meta.glob<string>('./screenshots/*.png', { query: '?no-inline', import: 'default', eager: true })

function screenshot(src: unknown) {
  if (typeof src !== 'string' || !src.startsWith('screenshot:')) return undefined
  const name = src.slice('screenshot:'.length)
  const [width, height] = (sizes as Record<string, number[]>)[name] ?? []
  const url = screenshots[`./screenshots/${name}.png`]
  return url && width && height
    ? { url, width: Math.round(width / SCREENSHOT_SCALE), height: Math.round(height / SCREENSHOT_SCALE) }
    : undefined
}

/** Markdown's default transform drops unknown schemes, which would empty every `screenshot:` image. */
function keepScreenshots(url: string) {
  return url.startsWith('screenshot:') ? url : defaultUrlTransform(url)
}

/** A doc split at its `##` headings, so Common problems can be drawn differently from the topics around it. */
function sections(markdown: string) {
  return markdown.split(/^(?=## )/m).map((text) => ({ text, problems: text.startsWith(`## ${PROBLEMS}\n`) }))
}

function HeadingLink({ id }: { id: string }) {
  return (
    <a
      href={`#${id}`}
      aria-label="Link to this section"
      className="ml-2 inline-flex align-middle text-faint opacity-0 transition-opacity group-hover/heading:opacity-100 hover:text-parchment focus-visible:opacity-100"
    >
      <Link2 className="size-4" aria-hidden />
    </a>
  )
}

/** A docs screenshot that opens at full size in a dialog, where small text in the page column becomes readable. */
function Screenshot({ src, alt, caption }: { src: unknown; alt: string; caption?: string }) {
  const image = screenshot(src)
  if (!image) return null
  const picture = (lazy: boolean) => (
    <img
      src={image.url}
      srcSet={`${image.url} ${SCREENSHOT_SCALE}x`}
      width={image.width}
      height={image.height}
      alt={alt}
      loading={lazy ? 'lazy' : undefined}
      className="h-auto max-w-full"
    />
  )
  return (
    <figure className="my-8">
      <Dialog>
        <DialogTrigger
          render={
            <button
              type="button"
              aria-label={`Enlarge screenshot: ${alt}`}
              className="block w-fit max-w-full cursor-zoom-in border border-edge bg-sunken p-2 transition-colors hover:border-edge-strong"
            />
          }
        >
          {picture(true)}
        </DialogTrigger>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{caption ?? alt}</DialogTitle>
          </DialogHeader>
          <DialogBody className="justify-items-center bg-sunken">{picture(false)}</DialogBody>
        </DialogContent>
      </Dialog>
      {caption ? <figcaption className="mt-2 text-sm text-faint">{caption}</figcaption> : null}
    </figure>
  )
}

function textOf(node: ExtraProps['node']): string {
  if (!node) return ''
  return node.children.map((child) => ('value' in child ? child.value : textOf(child as ExtraProps['node']))).join('')
}

const components: Components = {
  h2: ({ node, children }) => {
    const id = slug(textOf(node))
    return (
      <h2
        id={id}
        className="group/heading mt-12 mb-4 scroll-mt-header border-t border-edge pt-8 text-2xl first:mt-0 first:border-0 first:pt-0"
      >
        {children}
        <HeadingLink id={id} />
      </h2>
    )
  },
  h3: ({ node, children }) => {
    const id = slug(textOf(node))
    return (
      <h3 id={id} className="group/heading mt-8 mb-2 scroll-mt-header text-lg text-bone">
        {children}
        <HeadingLink id={id} />
      </h3>
    )
  },
  p: ({ node, children }) =>
    node?.children.length === 1 && node.children[0]?.type === 'element' && node.children[0].tagName === 'img' ? (
      children
    ) : (
      <p className="my-4 leading-relaxed text-dim">{children}</p>
    ),
  ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-5 leading-relaxed text-dim marker:text-faint">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-2 pl-5 leading-relaxed text-dim marker:text-faint">{children}</ol>,
  li: ({ children }) => <li className="pl-1 [&>ol]:mt-2 [&>ul]:mt-2">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-bone">{children}</strong>,
  a: ({ href, children }) =>
    href?.startsWith('/') ? (
      <Link to={href} className={proseLink}>
        {children}
      </Link>
    ) : (
      <a href={href} className={proseLink}>
        {children}
      </a>
    ),
  img: ({ src, alt, title }) => <Screenshot src={src} alt={alt ?? ''} caption={title} />,
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto border border-edge bg-sunken px-4 py-3 text-sm text-bone [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  code: ({ children }) => <code className="rounded-sm bg-raised px-1 py-px text-[0.9em] text-bone">{children}</code>,
  blockquote: ({ children }) => <blockquote className="my-5 border border-edge bg-panel px-4 py-1 [&_p]:text-bone">{children}</blockquote>,
}

/** Each symptom under Common problems reads as an entry in a list of fixes rather than another topic. */
const problemComponents: Components = {
  ...components,
  h3: ({ node, children }) => {
    const id = slug(textOf(node))
    return (
      <h3
        id={id}
        className="group/heading mt-6 mb-1 flex scroll-mt-header items-start gap-2.5 border-t border-edge pt-5 font-rules text-base font-semibold tracking-normal normal-case text-bone"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-discarded" aria-hidden />
        <span>
          {children}
          <HeadingLink id={id} />
        </span>
      </h3>
    )
  },
  p: ({ children }) => <p className="my-2 pl-6.5 leading-relaxed text-dim">{children}</p>,
}

export function DocsPage() {
  const [query, setQuery] = useState('')
  return (
    <main className="w-full">
      <PageHeader eyebrow="Help" title="Docs" description="How Praetorium works, what it checks and where its limits are.">
        <DocsSearchField value={query} onChange={setQuery} />
      </PageHeader>
      <PageContent className="space-y-6 pt-6">
        {query.trim() ? (
          <DocsSearchResults query={query} />
        ) : (
          <ul aria-label="Docs" className="grid gap-px border border-edge bg-edge md:grid-cols-2 lg:grid-cols-3">
            {bySection().map(({ section, docs }) => (
              <AreaTile key={section} section={section} docs={docs} />
            ))}
          </ul>
        )}
        <p className="text-sm text-dim">
          Still stuck?{' '}
          <Link to="/support" className={proseLink}>
            Contact support
          </Link>{' '}
          and tell us what happened; we’ll fix the app or the docs.
        </p>
      </PageContent>
    </main>
  )
}

function AreaTile({ section, docs }: { section: (typeof DOC_SECTIONS)[number]; docs: ProductDoc[] }) {
  const { icon: Icon, summary, action } = AREAS[section]
  const topics = docs.filter((doc) => !troubleshooting(doc))
  const fixes = docs.find(troubleshooting)
  return (
    <li className="flex flex-col bg-panel p-5">
      <h2 className="flex items-center gap-2.5 text-xl">
        <Icon className="size-5 shrink-0 text-info" aria-hidden />
        {section}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-dim">{summary}</p>
      <ol aria-label={`${section} docs`} className="mt-4 border-t border-edge pt-3 text-[0.9375rem]">
        {topics.map((doc) => (
          <li key={doc.slug}>
            <Link
              to="/docs/$docId"
              params={{ docId: doc.slug }}
              className="group flex items-center justify-between gap-3 py-1.5 text-bone transition-colors hover:text-parchment"
            >
              {doc.title}
              <ChevronRight className="size-4 shrink-0 text-faint transition-colors group-hover:text-parchment" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-4">
        {fixes ? (
          <Link
            to="/docs/$docId"
            params={{ docId: fixes.slug }}
            className="inline-flex items-center gap-1.5 text-sm text-dim transition-colors hover:text-parchment"
          >
            <TriangleAlert className="size-4 text-discarded" aria-hidden />
            {fixes.title}
          </Link>
        ) : null}
        {action ? (
          <Link to={action.to} className="eyebrow inline-flex items-center gap-1.5 text-info hover:text-parchment">
            {action.label}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
    </li>
  )
}

export function DocPage({ doc }: { doc: ProductDoc }) {
  const index = PRODUCT_DOCS.findIndex((entry) => entry.slug === doc.slug)
  const previous = PRODUCT_DOCS[index - 1]
  const next = PRODUCT_DOCS[index + 1]
  const { action } = AREAS[doc.section]
  return (
    <main className="w-full">
      <PageHeader
        eyebrow={doc.section}
        title={doc.title}
        description={doc.description}
        actions={
          action ? (
            <Link to={action.to} className={buttonClass({ variant: 'outline' })}>
              {action.label}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null
        }
      />
      <PageContent className="grid gap-x-10 pt-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="max-md:hidden">
          <nav
            aria-label="Docs"
            className="sticky top-[calc(var(--app-header)+1.5rem)] max-h-[calc(100dvh-var(--app-header)-3rem)] overflow-y-auto pr-2 text-sm"
          >
            <Link to="/docs" className="eyebrow text-info hover:text-parchment">
              All docs
            </Link>
            {bySection().map(({ section, docs }) => (
              <div key={section} className="mt-6">
                <p className="eyebrow text-faint">{section}</p>
                <ul className="mt-2 space-y-0.5">
                  {docs.map((entry) => (
                    <li key={entry.slug}>
                      <Link
                        to="/docs/$docId"
                        params={{ docId: entry.slug }}
                        aria-current={entry.slug === doc.slug ? 'page' : undefined}
                        className={`block border-l py-1 pl-3 transition-colors ${entry.slug === doc.slug ? 'border-parchment font-semibold text-bone' : 'border-edge text-dim hover:border-edge-strong hover:text-bone'}`}
                      >
                        {entry.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <Link to="/docs" className="eyebrow mb-6 inline-flex items-center gap-1.5 text-info hover:text-parchment md:hidden">
            <ArrowLeft className="size-3.5" aria-hidden />
            All docs
          </Link>
          <article className="font-rules [&>:not(figure)]:max-w-[42rem] [&>p:first-child]:text-lg [&>p:first-child]:text-bone">
            {sections(body(doc)).map(({ text, problems }) => (
              <Markdown key={text} components={problems ? problemComponents : components} urlTransform={keepScreenshots}>
                {text}
              </Markdown>
            ))}
          </article>
          <nav aria-label="More docs" className="mt-14 grid max-w-[42rem] gap-3 border-t border-edge pt-6 sm:grid-cols-2">
            {previous ? (
              <Pager doc={previous} label="Previous">
                <ArrowLeft className="size-3.5" aria-hidden />
              </Pager>
            ) : (
              <span className="max-sm:hidden" />
            )}
            {next ? (
              <Pager doc={next} label="Next" alignEnd>
                <ArrowRight className="size-3.5" aria-hidden />
              </Pager>
            ) : null}
          </nav>
          <p className="mt-8 max-w-[42rem] text-sm text-dim">
            Something missing or wrong? <FeedbackLink>Send feedback</FeedbackLink> or ask on{' '}
            <a href={DISCORD} className={proseLink}>
              Discord
            </a>
            .
          </p>
        </div>
      </PageContent>
    </main>
  )
}

function Pager({ doc, label, alignEnd, children }: { doc: ProductDoc; label: string; alignEnd?: boolean; children: ReactNode }) {
  return (
    <Link
      to="/docs/$docId"
      params={{ docId: doc.slug }}
      className={`group block border border-edge bg-panel px-4 py-3 transition-colors hover:border-edge-strong ${alignEnd ? 'sm:text-right' : ''}`}
    >
      <span className={`eyebrow flex items-center gap-1.5 text-faint ${alignEnd ? 'sm:justify-end' : ''}`}>
        {alignEnd ? null : children}
        {label} · {doc.section}
        {alignEnd ? children : null}
      </span>
      <span className="mt-1 block font-display uppercase group-hover:text-parchment">{doc.title}</span>
    </Link>
  )
}
