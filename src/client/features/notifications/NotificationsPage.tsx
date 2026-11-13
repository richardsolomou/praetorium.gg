import { useQuery } from '@tanstack/react-query'
import { PageContent, PageHeader } from '../../components/Page'
import { SignInRequired } from '../../components/SignInRequired'
import { meQuery } from '../../queries'
import { MarkAllRead, NoticeList } from './Notifications'

/** The same notices as the bell, as a page: where the app's More screen leads, since the app has no header bell. */
export function NotificationsPage() {
  const { data: me } = useQuery(meQuery())
  if (!me) return <SignInRequired title="Notifications" explanation="Sign in to see friend requests, new battles and event news." />
  return (
    <main className="w-full">
      <PageHeader
        title="Notifications"
        description="Friend requests, new battles, and news from your groups and tournaments."
        actions={<MarkAllRead />}
      />
      <PageContent>
        <div className="part overflow-hidden">
          <NoticeList />
        </div>
      </PageContent>
    </main>
  )
}
