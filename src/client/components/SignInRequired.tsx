import { Link } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button'
import { LogIn } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageState } from './PageState'

/**
 * What a signed-out visitor is shown instead of the thing they asked for.
 *
 * `next` carries where they were going, so an invite link survives the detour:
 * signing in lands them back in the battle rather than on the front page. `also`
 * is what the page can still offer without an account.
 */
export function SignInRequired({
  title,
  explanation,
  next,
  also,
}: {
  title: string
  explanation: string
  next?: string
  also?: ReactNode
}) {
  return (
    <main className="flex w-full">
      <PageState
        className="flex-1 border-x-0 border-t-0"
        eyebrow="Account required"
        title={title}
        explanation={explanation}
        icon={LogIn}
        action={
          <div className="flex w-full flex-col gap-2">
            <Link to="/sign-in" search={{ next }} className={buttonVariants({ className: 'h-11 w-full text-base' })}>
              Sign in
            </Link>
            {also}
          </div>
        }
      />
    </main>
  )
}
