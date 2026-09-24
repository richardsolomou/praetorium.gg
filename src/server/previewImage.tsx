import type { CSSProperties } from 'react'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import satori, { type Font } from 'satori'
import display500 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff?inline'
import display500Extended from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-ext-500-normal.woff?inline'
import display700 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff?inline'
import display700Extended from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-ext-700-normal.woff?inline'
import logo from '../../public/logo.svg?raw'
import { PREVIEW_SIZE, type PreviewCard, SITE } from '../contracts/linkPreview'

/** Renders at once, and renders waiting behind them, before a request is turned away. */
const RENDERS_AT_ONCE = 2
const RENDERS_WAITING = 16

const COLOR = {
  void: '#0b0c0e',
  edge: '#292d32',
  bone: '#eceff1',
  dim: '#a4a8ac',
  faint: '#83888d',
  parchment: '#89b89d',
  sides: ['#df8078', '#7eaa9e'],
} as const

/** Fontsource splits a face by script, and satori falls back between families rather than within one. */
const FAMILY = 'Barlow Semi Condensed'
const EXTENDED = 'Barlow Semi Condensed Extended'

const bytes = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')

let ready: Promise<Font[]> | undefined

/**
 * The rasteriser and the fonts, prepared once and only when a preview is first asked for.
 *
 * The WebAssembly is inlined rather than read from disk, so the production bundle, the
 * development server and the tests all find it without a path to agree on. It is
 * imported here so its megabytes load with the first preview rather than at startup.
 */
function prepare() {
  ready ??= import('@resvg/resvg-wasm/index_bg.wasm?inline').then(async ({ default: wasm }) => {
    await initWasm(bytes(wasm))
    return [
      { data: display500, weight: 500 as const, name: FAMILY },
      { data: display500Extended, weight: 500 as const, name: EXTENDED },
      { data: display700, weight: 700 as const, name: FAMILY },
      { data: display700Extended, weight: 700 as const, name: EXTENDED },
    ].map(({ data, ...font }) => ({ ...font, data: bytes(data), style: 'normal' as const }))
  })
  return ready
}

/** The card as SVG. Text is drawn as glyph outlines, so nothing a player typed reaches the markup as text. */
export async function previewSvg(card: PreviewCard) {
  return satori(<Frame card={card} />, { ...PREVIEW_SIZE, fonts: await prepare() })
}

export async function renderPreview(card: PreviewCard) {
  const renderer = new Resvg(await previewSvg(card))
  const image = renderer.render()
  try {
    return Buffer.from(image.asPng())
  } finally {
    image.free()
    renderer.free()
  }
}

let running = 0
const waiting: (() => void)[] = []

/** Hands a finished render's slot straight to the next one waiting, so a new arrival cannot slip in between. */
function release() {
  const next = waiting.shift()
  if (next) next()
  else running -= 1
}

/**
 * Whether a render may start, waiting for a slot while all of them are busy.
 *
 * Rendering is CPU work on the request thread, and a crawler unfurling a busy channel
 * can ask for many at once, so the work is bounded rather than left to pile up.
 */
async function slot() {
  if (running < RENDERS_AT_ONCE) {
    running += 1
    return true
  }
  if (waiting.length >= RENDERS_WAITING) return false
  await new Promise<void>((resolve) => waiting.push(resolve))
  return true
}

/**
 * The response for one preview image.
 *
 * `load` answers null for anything a reader without an account may not see, which is
 * the same 404 as a link to nothing: a preview never says more than the page would.
 * Neither answer depends on who is asking, which is what lets a shared cache hold them.
 */
export async function previewResponse(load: () => Promise<{ card: PreviewCard; maxAge: number } | null>) {
  if (!(await slot())) return new Response('Busy', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' } })
  try {
    const found = await load()
    if (!found) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    const png = await renderPreview(found.card)
    return new Response(png, {
      headers: {
        'Cache-Control': `public, max-age=${found.maxAge}`,
        'Content-Type': 'image/png',
        'Content-Length': String(png.byteLength),
      },
    })
  } finally {
    release()
  }
}

const LOGO = `data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}`

const clip: CSSProperties = { display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }

const KIND_LABEL = { battle: null, roster: 'Army list', player: 'Player', site: null } as const

function Frame({ card }: { card: PreviewCard }) {
  const label = card.kind === 'battle' ? card.stage : KIND_LABEL[card.kind]
  return (
    <div
      style={{
        ...PREVIEW_SIZE,
        display: 'flex',
        flexDirection: 'column',
        padding: '52px 64px',
        backgroundColor: COLOR.void,
        color: COLOR.bone,
        fontFamily: `${FAMILY}, ${EXTENDED}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <img src={LOGO} width={56} height={56} alt="" />
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: 6, textTransform: 'uppercase' }}>{SITE.name}</span>
        </div>
        {label ? (
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: COLOR.parchment }}>
            {label}
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}>
        <Body card={card} />
      </div>
    </div>
  )
}

function Body({ card }: { card: PreviewCard }) {
  if (card.kind === 'battle') return <Battle card={card} />
  if (card.kind === 'roster') return <Headline title={card.name} lead={card.faction} detail={card.detachments} figure={card.points} />
  if (card.kind === 'player') return <Headline title={card.name} lead={card.record} detail={card.rank} figure={null} />
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 56 }}>
      <img src={LOGO} width={220} height={220} alt="" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: 700 }}>
        <span style={{ display: 'block', lineClamp: 3, fontSize: 64, fontWeight: 700, lineHeight: 1.05 }}>{card.title}</span>
        <span style={{ display: 'block', lineClamp: 3, fontSize: 36, fontWeight: 500, color: COLOR.dim }}>{card.description}</span>
      </div>
    </div>
  )
}

function Headline({ title, lead, detail, figure }: { title: string; lead: string | null; detail: string | null; figure: string | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderLeft: `8px solid ${COLOR.parchment}`, paddingLeft: 36 }}>
      <span style={{ display: 'block', lineClamp: 2, fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>{title}</span>
      {lead ? <span style={{ ...clip, fontSize: 38, fontWeight: 500 }}>{lead}</span> : null}
      {detail ? <span style={{ ...clip, fontSize: 38, fontWeight: 500, color: COLOR.dim }}>{detail}</span> : null}
      {figure ? <span style={{ fontSize: 56, fontWeight: 700, color: COLOR.parchment, marginTop: 10 }}>{figure}</span> : null}
    </div>
  )
}

type BattleCard = Extract<PreviewCard, { kind: 'battle' }>

function Battle({ card }: { card: BattleCard }) {
  const [left, right] = card.sides
  const scored = card.sides.every((side) => side.score !== null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Side side={left} index={0} />
        <div style={{ display: 'flex', justifyContent: 'center', width: 280 }}>
          <span style={{ fontSize: scored ? 88 : 60, fontWeight: 700, lineHeight: 1 }}>
            {scored ? `${left?.score ?? 0}–${right?.score ?? 0}` : 'vs'}
          </span>
        </div>
        <Side side={right} index={1} />
      </div>
      {card.status || card.footer ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            borderTop: `2px solid ${COLOR.edge}`,
            paddingTop: 26,
          }}
        >
          {card.status ? <span style={{ ...clip, maxWidth: 1060, fontSize: 38, fontWeight: 500 }}>{card.status}</span> : null}
          {card.footer ? (
            <span style={{ ...clip, maxWidth: 1060, fontSize: 28, fontWeight: 500, color: COLOR.faint }}>{card.footer}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Side({ side, index }: { side: BattleCard['sides'][number] | undefined; index: 0 | 1 }) {
  const armies = side?.armies ?? []
  const pair = armies.length > 1
  const align = index === 0 ? 'left' : 'right'
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: pair ? 18 : 8,
        width: 396,
        [index === 0 ? 'borderLeft' : 'borderRight']: `8px solid ${COLOR.sides[index]}`,
        padding: '4px 28px',
      }}
    >
      {armies.map((army) => (
        <div key={army.player} style={{ display: 'flex', flexDirection: 'column', alignItems: index === 0 ? 'flex-start' : 'flex-end' }}>
          {/* A pair shares the height one player has, so each of them keeps to a line. */}
          <span
            style={{
              ...(pair ? clip : { display: 'block', lineClamp: 2, textAlign: align }),
              maxWidth: 340,
              fontSize: pair ? 40 : 52,
              fontWeight: 700,
              lineHeight: 1.05,
            }}
          >
            {army.player}
          </span>
          {army.faction ? (
            <span style={{ ...clip, maxWidth: 340, fontSize: pair ? 28 : 34, fontWeight: 500, color: COLOR.dim }}>{army.faction}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
