import { PageBreadcrumbs } from '@/components/page-breadcrumbs'

/**
 * The trail above a blog page title: Home / Blog /, plus any plain-text crumbs
 * for pages that sit deeper than a post. See {@link PageBreadcrumbs}.
 */
export function BlogBreadcrumbs({ trail = [] }: { trail?: Array<string> }) {
  return (
    <PageBreadcrumbs
      sections={[{ label: 'Blog', to: '/blog' }]}
      trail={trail}
    />
  )
}
