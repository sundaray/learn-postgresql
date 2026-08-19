import { Link } from '@tanstack/react-router'

/** The same back link the lessons index uses, pointing at the blog. */
export function BackToBlogLink() {
  return (
    <Link
      to="/blog"
      className="group flex w-fit items-center gap-2 text-sm text-foreground/70 transition-colors hover:text-navy-600"
    >
      <BackChevron />
      Blog
    </Link>
  )
}

/**
 * Lucide's chevron-left drawn by hand so a shaft can share its coordinates.
 * The chevron's vertex sits at (9, 12), so a line running right from that
 * point meets the chevron dead centre and completes an arrow. The shaft is
 * simply hidden until the link is hovered or focused.
 */
function BackChevron() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6"
    >
      <path d="m15 18-6-6 6-6" />
      <line
        x1="9"
        y1="12"
        x2="20"
        y2="12"
        className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </svg>
  )
}
