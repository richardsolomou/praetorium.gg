import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { PRODUCT_GUIDES, type ProductGuide } from '../../../contracts/productGuides'
import { PageContent, PageHeader } from '../../components/Page'

export function GuidesPage() {
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Praetorium"
        title="Player guides"
        description="Build an army, bring an existing list, test a matchup and track your next game."
      />
      <PageContent className="pt-6">
        <ul className="max-w-3xl divide-y divide-edge border-y border-edge">
          {PRODUCT_GUIDES.map((guide) => (
            <li key={guide.slug}>
              <Link to="/guides/$guideId" params={{ guideId: guide.slug }} className="group flex items-start gap-4 py-5 hover:text-info">
                <span className="min-w-0 flex-1">
                  <span className="block text-xl font-bold">{guide.title}</span>
                  <span className="mt-2 block font-rules text-sm text-dim">{guide.description}</span>
                </span>
                <ChevronRight className="mt-1 size-5 shrink-0 text-info" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </PageContent>
    </main>
  )
}

export function GuidePage({ guide }: { guide: ProductGuide }) {
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
        <div className="max-w-3xl space-y-10 font-rules">
          <ol aria-label="Steps" className="space-y-7">
            {guide.steps.map((step, index) => (
              <li key={step.title}>
                <h2 className="font-display text-xl">
                  {index + 1}. {step.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-dim">{step.text}</p>
              </li>
            ))}
          </ol>
          <section aria-labelledby="worked-example" className="space-y-5 border-t border-edge pt-7">
            <h2 id="worked-example" className="font-display text-2xl">
              Worked example: {guide.example.title}
            </h2>
            <ol aria-label="Example steps" className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-dim">
              {guide.example.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <figure className="space-y-3">
              <a href={guide.example.image} className="block overflow-hidden rounded border border-edge hover:border-info">
                <img
                  src={guide.example.image}
                  alt={guide.example.imageAlt}
                  width={guide.example.imageWidth}
                  height={guide.example.imageHeight}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full"
                />
              </a>
              <figcaption className="text-xs leading-relaxed text-dim">
                {guide.example.caption} Open the screenshot to see the controls.
              </figcaption>
            </figure>
          </section>
          <Link to={guide.action.to} className={buttonVariants({ variant: 'outline' })}>
            {guide.action.label}
          </Link>
          <section className="space-y-6 border-t border-edge pt-7">
            <h2 className="font-display text-2xl">Common questions</h2>
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
