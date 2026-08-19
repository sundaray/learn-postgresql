import { Fragment } from 'react'

import { Link, type LinkProps } from '@tanstack/react-router'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

type BreadcrumbSection = {
  label: string
  to: NonNullable<LinkProps['to']>
}

/**
 * The trail above a page title. It always opens with Home and, with nothing
 * else passed, ends on the separator after it, so the trail reads as leading
 * into the title below.
 *
 * `sections` adds linked crumbs after Home, for pages that sit under one.
 *
 * `trail` adds plain-text crumbs at the end. They are text rather than links
 * because there is no page behind them: /blog/tags has no route, and the final
 * crumb is the page you are already on. A trail closes the line, so it ends on
 * the crumb rather than a separator.
 */
export function PageBreadcrumbs({
  sections = [],
  trail = [],
}: {
  sections?: Array<BreadcrumbSection>
  trail?: Array<string>
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink
            className="hover:text-navy-600"
            render={<Link to="/" />}
          >
            Home
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>
          <SlashSeparator />
        </BreadcrumbSeparator>
        {sections.map((section) => (
          <Fragment key={section.label}>
            <BreadcrumbItem>
              <BreadcrumbLink
                className="hover:text-navy-600"
                render={<Link to={section.to} />}
              >
                {section.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <SlashSeparator />
            </BreadcrumbSeparator>
          </Fragment>
        ))}
        {trail.map((label, index) => (
          <TrailCrumb
            key={label}
            label={label}
            isCurrentPage={index === trail.length - 1}
          />
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/**
 * One plain-text crumb and the separator leading to the next one. The final
 * crumb is the page itself, so it is marked as the current page and ends the
 * trail with no separator after it.
 */
function TrailCrumb({
  label,
  isCurrentPage,
}: {
  label: string
  isCurrentPage: boolean
}) {
  return (
    <>
      <BreadcrumbItem>
        {isCurrentPage ? <BreadcrumbPage>{label}</BreadcrumbPage> : label}
      </BreadcrumbItem>
      {!isCurrentPage && (
        <BreadcrumbSeparator>
          <SlashSeparator />
        </BreadcrumbSeparator>
      )}
    </>
  )
}

/**
 * A hand-drawn slash instead of the default chevron. It is a single stroke
 * from the top right to the bottom left, tilted a further 10 degrees so it
 * leans like a typed "/" rather than sitting at a flat 45 degrees.
 */
function SlashSeparator() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 5 5 19" transform="rotate(-10 12 12)" />
    </svg>
  )
}
