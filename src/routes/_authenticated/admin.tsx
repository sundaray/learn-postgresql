import { Link, createFileRoute } from '@tanstack/react-router'
import { LockIcon } from 'lucide-react'

import { MainNavbar } from '@/components/main-navbar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { UsersTable } from '@/features/auth/components/users-table'
import { getUsers } from '@/features/auth/server/auth.functions'
import { SITE_NAME } from '@/lib/site'

export const Route = createFileRoute('/_authenticated/admin')({
  beforeLoad: ({ context }) => {
    return {
      isAdmin: context.session.user.role === 'admin',
    }
  },
  loader: async ({ context }) => {
    const users = context.isAdmin ? await getUsers() : []

    return { users }
  },
  head: () => ({
    meta: [
      { title: `Admin | ${SITE_NAME}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminPage,
})

function AdminPage() {
  const { isAdmin } = Route.useRouteContext()
  const { users } = Route.useLoaderData()

  if (!isAdmin) return <AdminOnly />

  return (
    <>
      <MainNavbar />

      <main className="mx-auto mt-16 w-full max-w-3xl px-6 py-12">
        <UsersTable users={users} />
      </main>
    </>
  )
}

function AdminOnly() {
  return (
    <>
      <MainNavbar />

      <main className="flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Card className="w-full max-w-sm items-center gap-4 p-6 text-center">
          <div className="flex size-11 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <LockIcon aria-hidden="true" className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-xl font-semibold">Admins only</h1>
            <p className="text-sm text-muted-foreground">
              You do not have access to this page.
            </p>
          </div>
          <Button variant="link" render={<Link to="/">Back to home</Link>} />
        </Card>
      </main>
    </>
  )
}
