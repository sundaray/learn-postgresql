import { useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { AppUserRow } from '@/features/auth/server/auth.functions'
import { impersonateUser } from '@/features/auth/server/auth.functions'

// Admin-only "Users" list: each row is an email with an Impersonate action.
// Borderless except for the horizontal rule between rows (divide-y) plus a top
// and bottom line (border-y).
export function UsersTable({ users }: { users: AppUserRow[] }) {
  const router = useRouter()
  const navigate = useNavigate()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function impersonate(userId: string) {
    setError(null)
    setPendingId(userId)
    const result = await impersonateUser({ data: { userId } })
    if (!result.ok) {
      setPendingId(null)
      setError(result.message || 'Could not impersonate that user.')
      return
    }
    // Re-read the server session so the menu and the ImpersonationBanner
    // reflect the impersonated user, then land on the home page as them.
    await router.invalidate()
    await navigate({ to: '/' })
  }

  return (
    <section>
      <h2 className="mb-4 font-heading text-xl font-medium">Users</h2>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users to show.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border border-y border-border">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="py-3 pr-4">
                  {user.email}
                  {user.role === 'admin' && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      admin
                    </span>
                  )}
                </td>
                <td className="w-0 py-3 text-right whitespace-nowrap">
                  {/* You cannot impersonate yourself or another admin. */}
                  {user.role !== 'admin' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pendingId !== null}
                      onClick={() => void impersonate(user.id)}
                    >
                      {pendingId === user.id ? 'Impersonating' : 'Impersonate'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </section>
  )
}
