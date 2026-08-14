import { Link, createFileRoute } from '@tanstack/react-router'

import logoUrl from '@/assets/learn-postgresql-logo.svg'
import { SiteMenu } from '@/components/site-menu'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main className="grid min-h-screen place-items-center bg-white text-slate-950">
      <SiteMenu />

      <div id="about" className="flex flex-col items-center gap-6">
        <img
          src={logoUrl}
          alt=""
          className="h-40 w-auto"
        />
        <h1 className="text-center text-5xl font-semibold tracking-tight">
          Learn <span className="text-navy-600">PostgreSQL</span>
        </h1>
        <Link to="/lessons" className="text-lg underline underline-offset-4">
          Get started
        </Link>
      </div>
    </main>
  )
}
