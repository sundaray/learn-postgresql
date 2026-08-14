import { useState, type ComponentProps } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
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

  return (
    <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <SheetTrigger render={<MenuButton isOpen={isMenuOpen} />} />

      <SheetContent
        side="left"
        showCloseButton={false}
        className="site-menu-sheet gap-0 p-0"
        style={{ width: '100vw', maxWidth: 'none' }}
      >
        <SheetTitle className="sr-only">Main menu</SheetTitle>
        <SheetDescription className="sr-only">
          Navigate to the about section or browse the lessons.
        </SheetDescription>

        {/*
          The trigger button stays mounted behind the sheet and owns the
          hamburger/close morph. This one sits exactly on top of it as a
          transparent hit target, because the page is inert while the sheet
          is open and the trigger can no longer be clicked.
        */}
        <SheetClose
          render={<MenuButton isOpen={isMenuOpen} isClickTargetOnly />}
        />

        <div className="site-menu-panel w-[min(86vw,28rem)] border-r border-navy-900/10 bg-white shadow-2xl">
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
          </nav>
        </div>
      </SheetContent>
    </Sheet>
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
        'site-menu-button fixed top-6 right-6 z-[60] flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium tracking-wide text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-navy-600 sm:top-8 sm:right-8',
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
