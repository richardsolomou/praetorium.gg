import type { LinkProps } from '@tanstack/react-router'
import { Bot, Calculator, FileInput, type LucideIcon, ScrollText, Swords, Trophy, UserRound, UsersRound } from 'lucide-react'
import { DOC_SECTIONS, PRODUCT_DOCS, type ProductDoc } from '../../../contracts/productDocs'
import { headings } from './docsOutline'
import { matchesSearch } from '../../text'

const bodies = import.meta.glob<string>('./content/*.md', { query: '?raw', import: 'default', eager: true })

export function body(doc: ProductDoc) {
  return bodies[`./content/${doc.slug}.md`] ?? ''
}

/** What each area of the docs covers, and the screen it explains. */
export const AREAS: Record<
  (typeof DOC_SECTIONS)[number],
  { icon: LucideIcon; summary: string; action?: { to: LinkProps['to']; label: string } }
> = {
  'Army lists': {
    icon: ScrollText,
    summary: 'Build a list, set up its units and keep it legal.',
    action: { to: '/rosters', label: 'Open Rosters' },
  },
  Imports: {
    icon: FileInput,
    summary: 'Bring lists in from other apps, and share them back out.',
    action: { to: '/rosters', label: 'Open Rosters' },
  },
  'Combat simulator': {
    icon: Calculator,
    summary: 'See what a loadout, a Leader or a buff actually changes.',
    action: { to: '/simulator', label: 'Open Simulator' },
  },
  Battles: {
    icon: Swords,
    summary: 'Track a game from setup to the final score.',
    action: { to: '/battles', label: 'Open Battles' },
  },
  Groups: {
    icon: UsersRound,
    summary: 'Keep a running table of the games your group plays.',
    action: { to: '/groups', label: 'Open Groups' },
  },
  Tournaments: {
    icon: Trophy,
    summary: 'Seal rosters in secret, reveal them together, then play each other.',
    action: { to: '/tournaments', label: 'Open Tournaments' },
  },
  'AI assistants': {
    icon: Bot,
    summary: 'Ask Claude, ChatGPT or another assistant about units, points and matchups.',
  },
  'Account and app': {
    icon: UserRound,
    summary: 'Sign in, keep your account secure, and use the mobile app.',
    action: { to: '/profile', label: 'Open Profile' },
  },
}

/** Whether a doc is an area's list of fixes rather than a topic. */
export function troubleshooting(doc: ProductDoc) {
  return headings(body(doc)).some((heading) => heading.problem)
}

export function bySection() {
  return DOC_SECTIONS.map((section) => ({ section, docs: PRODUCT_DOCS.filter((doc) => doc.section === section) }))
}

/** Pages and the symptoms listed under Common problems, which the index filter searches. */
const SEARCHABLE = PRODUCT_DOCS.flatMap((doc) => [
  { key: doc.slug, doc, text: doc.title, detail: doc.description, hash: undefined as string | undefined },
  ...headings(body(doc))
    .filter((heading) => heading.problem)
    .map((heading) => ({ key: `${doc.slug}#${heading.id}`, doc, text: heading.text, detail: doc.title, hash: heading.id })),
])

export const docsMatching = (query: string) =>
  SEARCHABLE.filter((entry) => matchesSearch(`${entry.text} ${entry.detail} ${entry.doc.section}`, query))

export const proseLink =
  'text-info underline decoration-info/40 underline-offset-3 transition-colors hover:text-parchment hover:decoration-parchment'
