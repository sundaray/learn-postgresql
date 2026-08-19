import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

// Proves the browser runner boots real Chromium, compiles JSX, and that
// vitest-browser-react's locators resolve. Delete once real component tests
// exist.
function BootProbe({ label }: { label: string }) {
  return <p>{label}</p>
}

it('the browser runner renders a react component', async () => {
  const screen = await render(<BootProbe label="forum test infrastructure" />)

  await expect
    .element(screen.getByText('forum test infrastructure'))
    .toBeInTheDocument()
})
