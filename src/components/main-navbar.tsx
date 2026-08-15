import { SiteMenu } from '@/components/site-menu'

/**
 * The top bar for the pages outside the workspace. The workspace has its own
 * header, so it does not use this.
 *
 * The bar itself takes no layout space: the menu button inside it is pinned to
 * the top of the viewport so it stays reachable while the page scrolls. This
 * wrapper exists to give the navigation a real landmark of its own and to keep
 * both pages rendering the same thing.
 */
export function MainNavbar() {
  return (
    <header aria-label="Main">
      <SiteMenu />
    </header>
  )
}
