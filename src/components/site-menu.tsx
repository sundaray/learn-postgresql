import { useState, type ComponentProps, type ReactNode } from 'react'
import { Link, useRouteContext, useRouter, useRouterState } from '@tanstack/react-router'
import { Result } from 'better-result'

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { signOut } from '@/features/auth/server/auth.functions'
import { cn } from '@/lib/utils'

/**
 * The full-height navigation panel shared by the marketing pages. The workspace
 * has its own header menu, so this is only for pages outside it.
 */
export function SiteMenu() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // About is a section of the home page, so off home it needs a real
  // navigation rather than an in-page anchor.
  const isHome = useRouterState({
    select: (state) => state.location.pathname === '/',
  })
  // The root route reads the session before anything renders, so the menu shows
  // the right state on the first paint instead of flashing "Login".
  const { session } = useRouteContext({ from: '__root__' })

  return (
    <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <MenuButtonRow>
        <SheetTrigger render={<MenuButton isOpen={isMenuOpen} />} />
      </MenuButtonRow>

      <SheetContent
        side="left"
        showCloseButton={false}
        className="site-menu-sheet gap-0 p-0"
        style={{ width: '100vw', maxWidth: 'none' }}
      >
        <SheetTitle className="sr-only">Main menu</SheetTitle>
        <SheetDescription className="sr-only">
          Navigate to the about section, the lessons, or the blog.
        </SheetDescription>

        {/*
          The trigger button stays mounted behind the sheet and owns the
          hamburger/close morph. This one sits exactly on top of it as a
          transparent hit target, because the page is inert while the sheet
          is open and the trigger can no longer be clicked.
        */}
        <MenuButtonRow>
          <SheetClose
            render={<MenuButton isOpen={isMenuOpen} isClickTargetOnly />}
          />
        </MenuButtonRow>

        <div className="site-menu-panel w-[min(86vw,28rem)] overflow-y-auto border-r border-navy-900/10 bg-white pb-10 shadow-2xl">
          <nav
            aria-label="Main navigation"
            className="flex flex-col px-8 pt-32 sm:px-12"
          >
            <SheetClose
              render={
                isHome ? (
                  <a href="#about" className="site-menu-link" />
                ) : (
                  <Link to="/" hash="about" className="site-menu-link" />
                )
              }
            >
              About
            </SheetClose>
            <SheetClose render={<Link to="/lessons" className="site-menu-link" />}>
              Lessons
            </SheetClose>
            <SheetClose render={<Link to="/blog" className="site-menu-link" />}>
              Blog
            </SheetClose>
            {session ? null : (
              <SheetClose render={<Link to="/login" className="site-menu-link" />}>
                Login
              </SheetClose>
            )}
            {session?.user.role === 'admin' ? (
              <SheetClose render={<Link to="/admin" className="site-menu-link" />}>
                Admin
              </SheetClose>
            ) : null}
          </nav>

          {session ? (
            <AccountSection
              email={session.user.email}
              onSignedOut={() => setIsMenuOpen(false)}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * The signed-in footer of the menu panel: who you are, and the way out. Set in
 * smaller type than the navigation links above it, so it reads as a status area
 * rather than a fifth destination.
 */
function AccountSection({
  email,
  onSignedOut,
}: Readonly<{ email: string; onSignedOut: () => void }>) {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutFailed, setSignOutFailed] = useState(false)

  async function handleSignOut() {
    setSignOutFailed(false)
    setIsSigningOut(true)

    const outcome = await Result.tryPromise(() => signOut())

    setIsSigningOut(false)

    // A rejected call never reached the server; an ok:false one reached it and
    // came back refused. Neither leaves the visitor signed out, so both show
    // the same retry hint.
    if (Result.isError(outcome) || !outcome.value.ok) {
      setSignOutFailed(true)
      return
    }

    onSignedOut()
    // Re-runs the root route so the menu, and anything else reading the
    // session, sees a signed-out visitor.
    await router.invalidate()
  }

  return (
    <div className="mt-8 border-t border-navy-900/10 px-8 pt-6 sm:px-12">
      <p className="text-sm text-slate-500">logged in as</p>
      <p className="truncate text-base font-semibold text-slate-950">{email}</p>
      <button
        type="button"
        disabled={isSigningOut}
        onClick={() => void handleSignOut()}
        className="mt-4 inline-flex items-center gap-2 text-base font-medium text-slate-950 transition-colors hover:text-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSigningOut ? <Spinner className="size-4" /> : null}
        Sign out
      </button>
      {signOutFailed ? (
        <p className="mt-2 text-sm text-destructive">
          Couldn&apos;t sign out. Try again.
        </p>
      ) : null}
    </div>
  )
}

/**
 * Pins the menu button to the top of the viewport while keeping it inside a
 * container capped at 10xl, so on a wide monitor the button sits closer to the
 * content instead of drifting off to the far screen edge.
 *
 * Both the trigger and the click target inside the open sheet use this, and
 * they have to agree, because the two buttons are meant to sit exactly on top
 * of each other.
 */
function MenuButtonRow({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The row spans the viewport, so it must not swallow clicks meant for the
    // page underneath it. Only the button itself takes pointer events.
    <div className="pointer-events-none fixed inset-x-0 top-6 z-[60] sm:top-8">
      <div className="mx-auto flex max-w-10xl justify-end px-6 sm:px-8">
        {children}
      </div>
    </div>
  )
}

function MenuButton({
  isOpen,
  isClickTargetOnly = false,
  ...props
}: Readonly<
  ComponentProps<'button'> & { isOpen: boolean; isClickTargetOnly?: boolean }
>) {
  return (
    <button
      type="button"
      aria-label={isOpen ? 'Close menu' : 'Open menu'}
      className={cn(
        'site-menu-button pointer-events-auto flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium tracking-wide text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-navy-600',
        // Invisible, but still shown on keyboard focus so the outline is not lost.
        isClickTargetOnly && 'opacity-0 focus-visible:opacity-100',
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="site-menu-icon"
        data-open={isOpen ? '' : undefined}
      >
        <span />
        <span />
        <span />
      </span>
      <span>Menu</span>
    </button>
  )
}
