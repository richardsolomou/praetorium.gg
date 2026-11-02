import type { ReactNode } from 'react'

/** The wide-screen half beside an account form: the heading, a sprue with the mark at its hub, and a closing line. */
export function AuthAside({ heading, caption }: { heading: ReactNode; caption: ReactNode }) {
  return (
    <aside className="masthead-bleed relative hidden overflow-hidden border-r border-edge bg-sunken [--band-bottom:0px] [--band:var(--color-sunken)] md:block">
      <div className="construction-grid" />
      <div className="relative ml-auto grid h-full w-full max-w-xl grid-rows-[auto_1fr_auto] gap-8 p-8 lg:p-12">
        <h2 className="max-w-md text-4xl leading-[0.95] text-balance lg:text-5xl">{heading}</h2>
        <SprueFrame />
        <p className="text-sm text-dim">{caption}</p>
      </div>
    </aside>
  )
}

const PARTS = [
  { tag: 1, x: 150, y: 52, w: 66, h: 52, gate: 'M150 78H116' },
  { tag: 2, x: 34, y: 254, r: 28, gate: 'M90 282H116' },
  { tag: 3, x: 276, y: 74, w: 58, h: 48, gate: 'M334 98H364' },
  { tag: 4, x: 392, y: 246, w: 56, h: 52, gate: 'M392 272H364' },
] as const

/** A frame of runners with numbered parts on its gates, drawn in the runner colours. */
function SprueFrame() {
  return (
    <svg viewBox="0 0 482 370" className="w-full max-w-md self-center justify-self-center" aria-hidden>
      <g fill="none" stroke="var(--color-runner)" strokeWidth="3">
        <rect x="2" y="2" width="478" height="366" rx="26" />
        <path d="M116 2V368M240 2V136M240 234V368M364 2V368M2 184H190M290 184H480" />
        {PARTS.map((part) => (
          <path key={part.tag} d={part.gate} />
        ))}
      </g>
      {PARTS.map((part) => {
        const cx = 'r' in part ? part.x + part.r : part.x + part.w / 2
        return (
          <g key={part.tag}>
            {'r' in part ? (
              <circle cx={cx} cy={part.y + part.r} r={part.r} fill="var(--color-panel)" stroke="var(--color-runner-hi)" strokeWidth="2" />
            ) : (
              <rect
                x={part.x}
                y={part.y}
                width={part.w}
                height={part.h}
                rx="9"
                fill="var(--color-panel)"
                stroke="var(--color-runner-hi)"
                strokeWidth="2"
              />
            )}
            <PartTag x={cx} y={part.y - 12} label={part.tag} />
          </g>
        )
      })}
      <circle cx="240" cy="184" r="50" fill="var(--color-panel)" stroke="var(--color-runner-hi)" strokeWidth="2" />
      <image href="/logo.svg" x="208" y="152" width="64" height="64" />
      <PartTag x={240} y={120} label={5} />
    </svg>
  )
}

function PartTag({ x, y, label }: { x: number; y: number; label: number }) {
  return (
    <g>
      <rect x={x - 12} y={y - 8} width="24" height="16" rx="8" fill="var(--color-bone)" />
      <text x={x} y={y + 4} textAnchor="middle" className="fill-void font-display text-[11px] font-bold">
        {label}
      </text>
    </g>
  )
}
