import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
      <h1 className="text-5xl font-semibold">Hello World</h1>
    </main>
  )
}
