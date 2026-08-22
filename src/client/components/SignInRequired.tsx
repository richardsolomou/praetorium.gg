import { Link } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button'
import { LogIn } from 'lucide-react'
import { PageState } from './PageState'

/**
 * What a signed-out visitor is shown instead of the thing they asked for.
 *
 * `next` carries where they were going, so an invite link survives the detour:
 * signing in lands them back in the battle rather than on the front page.
 */
export function SignInRequired({ title, explanation, next }: { title: string; explanation: string; next?: string }) {
  return (
    <main className="w-full">
      <PageState
        className="min-h-[calc(100dvh-7rem)] border-x-0 border-t-0"
        eyebrow="Account required"
        title={title}
        explanation={explanation}
        icon={LogIn}
        action={
          <Link to="/signin" search={{ next }} className={buttonVariants({ className: 'h-11 w-full text-base' })}>
            Sign in
          </Link>
        }
      />
    </main>
  )
}
