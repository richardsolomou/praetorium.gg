import type { ComponentProps } from 'react'

/** One setting inside the profile's Preferences panel: what it is beside its controls. */
export function SettingsSection({
  title,
  description,
  children,
  ...props
}: Omit<ComponentProps<'section'>, 'title' | 'className'> & { title: string; description: string }) {
  return (
    <section {...props} className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <div>
        <h3 className="text-base">{title}</h3>
        <p className="mt-1 text-sm text-dim">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
