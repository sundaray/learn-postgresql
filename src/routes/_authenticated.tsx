import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

// Pathless layout: anything nested under it requires a session. The root route
// has already read the session into context, so this is a plain check with no
// second round-trip.
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: {
          redirectTo: location.href,
        },
      })
    }

    return {
      session: context.session,
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return <Outlet />
}
