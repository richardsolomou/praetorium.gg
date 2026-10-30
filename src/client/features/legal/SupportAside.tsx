import { Link } from '@tanstack/react-router'
import { Bug, Mail, MessagesSquare, UserX, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { version } from '../../../../package.json'
import { DISCORD, PRIVACY_EMAIL, SOURCE } from '../../projectLinks'
import { SectionHeading } from '../../components/SectionHeading'

/** How feedback reaches us and the other channels, beside the Support page. */
export function SupportAside() {
  return (
    <aside aria-label="Contact us" className="space-y-8 text-sm text-dim">
      <section aria-labelledby="how-feedback-works" className="space-y-2">
        <SectionHeading id="how-feedback-works" title="How feedback works" />
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
        <SectionHeading id="other-ways" title="Other ways to reach us" />
        <ul className="divide-y divide-edge">
          <Channel icon={MessagesSquare} href={DISCORD} label="Praetorium Discord">
            Community help and feature ideas.
          </Channel>
          <Channel icon={Bug} href={`${SOURCE}/issues/new`} label="Public issue tracker">
            Report a problem in public. Include what you expected, what happened, the page address, your device, operating system and
            Praetorium version. Never include a password, two-factor secret, recovery code or private roster link.
          </Channel>
          <Channel icon={Mail} href={`mailto:${PRIVACY_EMAIL}`} label={PRIVACY_EMAIL}>
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
