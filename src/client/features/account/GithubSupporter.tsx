import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { checkGithubSponsorship } from '../../../server/functions'
import { SPONSOR } from '../../projectLinks'
import { githubSponsorshipQuery } from '../../queries'
import { errorMessage } from '../../queryClient'

const SPONSORSHIP_TEXT = {
  public: 'Public sponsor. Your profile shows the Supporter badge.',
  private: 'Private sponsor. Make your sponsorship public on GitHub to show the badge.',
  none: 'No active sponsorship found. Sponsors get a Supporter badge on their profile.',
}

export function GithubSupporter() {
  const queryClient = useQueryClient()
  const { data: status } = useQuery(githubSponsorshipQuery())
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: githubSponsorshipQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: ['user-profile'] }),
    ])
  }
  const check = useMutation({ mutationFn: () => checkGithubSponsorship(), onSuccess: refresh })
  if (!status?.available) return null
  const { linked } = status
  return (
    <div data-github-supporter className="space-y-2 border-l-2 border-info/40 py-1 pl-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-dim">
          {linked ? (
            SPONSORSHIP_TEXT[status.sponsorship ?? 'none']
          ) : (
            <>
              Link GitHub to check your sponsorship.{' '}
              <a href={SPONSOR} className="text-info underline-offset-4 hover:underline" rel="noreferrer noopener" target="_blank">
                Sponsor Praetorium
              </a>
            </>
          )}
        </p>
        {linked ? (
          <Button type="button" variant="ghost" size="sm" disabled={check.isPending} onClick={() => check.mutate()}>
            {check.isPending ? 'Checking…' : 'Check again'}
          </Button>
        ) : null}
      </div>
      {check.error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(check.error)}
        </p>
      ) : null}
    </div>
  )
}
