import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

/** The same back link the lessons index uses, pointing at the blog. */
export function BackToBlogLink() {
  return (
    <Link
      to="/blog"
      className="group flex w-fit items-center gap-2 text-sm text-foreground/70 transition-colors hover:text-navy-600"
    >
      <ArrowLeft
        aria-hidden
        className="size-4 transition-transform duration-200 ease-out group-hover:-translate-x-1"
      />
      Blog
    </Link>
  )
}
