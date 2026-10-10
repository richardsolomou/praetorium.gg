import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { PRODUCT_GUIDES, type ProductGuide } from '../../../contracts/productGuides'
import { PageContent, PageHeader } from '../../components/Page'
import { guideVisual } from './guideVisuals'

export function GuidesPage() {
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Praetorium"
        title="Player guides"
        description="Prepare for a game, give your army a plan and learn how to score. Find help with lists, matchups and tracking too."
      />
      <PageContent className="pt-6">
        <ul className="grid gap-5 sm:grid-cols-2">
          {PRODUCT_GUIDES.map((guide) => {
            const visual = guideVisual(guide)
            return (
              <li key={guide.slug}>
                <Link
                  to="/guides/$guideId"
                  params={{ guideId: guide.slug }}
                  className="group block h-full overflow-hidden rounded border border-edge bg-panel transition-colors hover:border-info"
                >
                  <div className="relative aspect-[16/9] overflow-hidden border-b border-edge bg-sunken">
                    <img
                      src={visual.image}
                      alt=""
                      width={visual.width}
                      height={visual.height}
                      loading="lazy"
                      className={visual.screenshot ? 'h-full w-full object-cover object-top' : 'h-full w-full object-contain p-3'}
                    />
                  </div>
                  <div className="p-5">
                    <span className="flex items-start gap-3">
                      <span className="min-w-0 flex-1 text-xl font-bold group-hover:text-info">{guide.title}</span>
                      <ChevronRight className="mt-1 size-5 shrink-0 text-info" aria-hidden />
                    </span>
                    <span className="mt-3 block font-rules text-sm leading-relaxed text-dim">{guide.description}</span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </PageContent>
    </main>
  )
}

export function GuidePage({ guide }: { guide: ProductGuide }) {
  const visual = guideVisual(guide)
  return (
    <main className="w-full">
      <PageHeader eyebrow="Player guide" title={guide.title} description={guide.description} />
      <PageContent className="space-y-8 pt-6">
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/guides" />}>Player guides</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{guide.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <section aria-label="Guide overview" className="grid overflow-hidden rounded border border-edge bg-panel md:grid-cols-[1.25fr_1fr]">
          <figure className="flex min-w-0 flex-col justify-center bg-sunken p-4 sm:p-6">
            <a href={visual.image} className="block">
              <img
                src={visual.image}
                alt={visual.alt}
                width={visual.width}
                height={visual.height}
                className={visual.screenshot ? 'max-h-80 w-full rounded border border-edge object-cover object-top' : 'w-full'}
              />
            </a>
            <figcaption className="mt-3 text-xs leading-relaxed text-dim">{visual.caption}</figcaption>
          </figure>
          <div className="flex flex-col justify-center p-5 sm:p-7">
            <h2 className="text-2xl">{visual.title}</h2>
            <ul className="mt-5 space-y-4 font-rules text-sm">
              {visual.points.map((point, index) => (
                <li key={point} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/40 text-2xs font-bold text-primary"
                  >
                    {index + 1}
                  </span>
                  <span className="text-dim">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <div className="space-y-8 font-rules">
          <ol aria-label="Steps" className="grid gap-4 sm:grid-cols-2">
            {guide.steps.map((step, index) => (
              <li
                key={step.title}
                className={`rounded border border-edge bg-panel p-5 ${index === guide.steps.length - 1 && guide.steps.length % 2 ? 'sm:col-span-2' : ''}`}
              >
                <span aria-hidden className="figure text-3xl text-primary/60">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h2 className="mt-3 font-display text-xl">{step.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-dim">{step.text}</p>
              </li>
            ))}
          </ol>
          <section
            aria-labelledby="worked-example"
            className="grid gap-5 rounded border border-info/25 bg-info/5 p-5 sm:p-7 md:grid-cols-[1fr_1.6fr]"
          >
            <h2 id="worked-example" className="font-display text-2xl text-info">
              {guide.example.title}
            </h2>
            <ol aria-label="Example steps" className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-dim">
              {guide.example.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
          <Link to={guide.action.to} className={buttonVariants({ variant: 'outline' })}>
            {guide.action.label}
          </Link>
          <section className="grid gap-5 border-t border-edge pt-7 sm:grid-cols-2">
            <h2 className="font-display text-2xl sm:col-span-2">Common questions</h2>
            {guide.questions.map(({ question, answer }) => (
              <div key={question}>
                <h3 className="font-display text-lg">{question}</h3>
                <p className="mt-2 text-sm leading-relaxed text-dim">{answer}</p>
              </div>
            ))}
          </section>
          <p className="text-sm leading-relaxed text-dim">
            Game data comes from verified community sources. Read the{' '}
            <Link to="/sources" className="text-info hover:text-parchment">
              data sources
            </Link>{' '}
            and{' '}
            <Link to="/data-updates" className="text-info hover:text-parchment">
              data updates
            </Link>{' '}
            for attribution and recorded changes.
          </p>
        </div>
      </PageContent>
    </main>
  )
}
