import { Link } from '@tanstack/react-router'
import { Bug, Mail, MessagesSquare, UserX, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { version } from '../../../../package.json'
import { cn } from '@/lib/utils'
import { DISCORD, SOURCE } from '../../projectLinks'

/** How feedback reaches us and the other channels, beside the Support page and each conversation. */
export function SupportAside({ className }: { className?: string }) {
  return (
    <aside aria-label="Contact us" className={cn('space-y-8 text-sm text-dim', className)}>
      <section aria-labelledby="how-feedback-works" className="space-y-2">
        <h2 id="how-feedback-works" className="rubric border-b border-edge pb-2">
          How feedback works
        </h2>
        <p>
          Send feedback from any page, through the account menu or the More tab. It sends us that page, your device and this version of
          Praetorium with your message, and you can attach a screenshot.
        </p>
        <p>
          Our replies appear under Your conversations on the Support page, where you can answer them. Signed in, they follow you to every
          device.
        </p>
      </section>

      <section aria-labelledby="other-ways" className="space-y-2">
        <h2 id="other-ways" className="rubric border-b border-edge pb-2">
          Other ways to reach us
        </h2>
        <ul className="divide-y divide-edge">
          <Channel icon={MessagesSquare} href={DISCORD} label="Praetorium Discord">
            Community help and feature ideas.
          </Channel>
          <Channel icon={Bug} href={`${SOURCE}/issues/new`} label="Public issue tracker">
            Report a problem in public. Include what you expected, what happened, the page address, your device, operating system and
            Praetorium version. Never include a password, two-factor secret, recovery code or private roster link.
          </Channel>
          <Channel icon={Mail} href="mailto:privacy@praetorium.gg" label="privacy@praetorium.gg">
            For a private account, privacy or deletion request.
          </Channel>
          <li className="flex gap-3 py-3">
            <UserX className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            <span>
              To delete your account yourself, follow{' '}
              <Link to="/delete-account" className="text-info hover:text-parchment">
                Delete account
              </Link>
              .
            </span>
          </li>
        </ul>
      </section>

      <p className="text-xs text-faint">
        This page is running Praetorium <span className="readout text-dim">{version}</span>.
      </p>
    </aside>
  )
}

function Channel({ icon: Icon, href, label, children }: { icon: LucideIcon; href: string; label: string; children: ReactNode }) {
  const external = href.startsWith('http')
  return (
    <li className="flex gap-3 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
      <span className="min-w-0">
        <a
          href={href}
          className="font-semibold break-words text-bone hover:text-parchment"
          {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        >
          {label}
        </a>
        <span className="mt-0.5 block">{children}</span>
      </span>
    </li>
  )
}
