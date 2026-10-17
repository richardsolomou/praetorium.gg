import type { ComponentProps } from 'react'

export function SettingsSection({
  title,
  description,
  children,
  ...props
}: Omit<ComponentProps<'section'>, 'title' | 'className'> & { title: string; description: string }) {
  return (
    <section {...props} className="space-y-4 border border-edge bg-panel p-5 md:p-7 lg:col-span-2">
      <div>
        <h2 className="rubric border-b border-edge pb-2">{title}</h2>
        <p className="mt-2 text-sm text-dim">{description}</p>
      </div>
      {children}
    </section>
  )
}
