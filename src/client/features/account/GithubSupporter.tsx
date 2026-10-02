import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { checkGithubSponsorship } from '../../../server/functions'
import { SPONSOR } from '../../projectLinks'
import { accountMethodsQuery, githubSponsorshipQuery } from '../../queries'
import { errorMessage } from '../../queryClient'

const SPONSORSHIP_TEXT = {
  public: 'Your profile shows the supporter badge. Thank you for helping keep Praetorium running.',
  private: 'Your sponsorship is private on GitHub, so your profile does not show a badge. Make it public on GitHub to show one.',
  none: 'This GitHub account is not sponsoring the project. Sponsors get a supporter badge on their profile and nothing else changes.',
}

export function GithubSupporter() {
  const queryClient = useQueryClient()
  const { data: status } = useQuery(githubSponsorshipQuery())
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: githubSponsorshipQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: accountMethodsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: ['user-profile'] }),
    ])
  }
  const check = useMutation({ mutationFn: () => checkGithubSponsorship(), onSuccess: refresh })
  if (!status?.available) return null
  const { linked } = status
  return (
    <section data-github-supporter className="space-y-4 border border-edge bg-panel p-5 md:p-7 lg:col-span-2">
      <div>
        <p className="rubric border-b border-edge pb-2">Supporter</p>
        <h2 className="mt-4 text-base">GitHub Sponsors</h2>
        <p className="mt-1 text-sm text-dim">
          {linked ? (
            SPONSORSHIP_TEXT[status.sponsorship ?? 'none']
          ) : (
            <>
              <a
                href={SPONSOR}
                className="text-info underline-offset-4 hover:text-parchment hover:underline"
                rel="noreferrer noopener"
                target="_blank"
              >
                Sponsors
              </a>{' '}
              who link GitHub under{' '}
              <a href="#sign-in-methods" className="text-info underline-offset-4 hover:underline">
                Sign-in methods
              </a>{' '}
              get a supporter badge on their profile.
            </>
          )}
        </p>
      </div>
      {linked ? (
        <Button type="button" variant="outline" size="sm" disabled={check.isPending} onClick={() => check.mutate()}>
          {check.isPending ? 'Checking…' : 'Check again'}
        </Button>
      ) : null}
      {check.error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(check.error)}
        </p>
      ) : null}
    </section>
  )
}
