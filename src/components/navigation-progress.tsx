import { useEffect, useRef, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'

function random(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function trickleStep(current: number): number {
  if (current === 0) return 15
  if (current < 50) return random(1, 10)
  return random(1, 5)
}

export function NavigationProgress() {
  const isNavigating = useRouterState({
    select: (state) => state.status === 'pending',
  })
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const activeRef = useRef(false)
  const timersRef = useRef<{
    start?: number
    interval?: number
    hide?: number
    reset?: number
  }>({})

  useEffect(() => {
    const timers = timersRef.current
    const clearAll = () => {
      window.clearTimeout(timers.start)
      window.clearInterval(timers.interval)
      window.clearTimeout(timers.hide)
      window.clearTimeout(timers.reset)
    }

    clearAll()

    if (isNavigating) {
      timers.start = window.setTimeout(() => {
        activeRef.current = true
        setVisible(true)
        setWidth(trickleStep(0))
        timers.interval = window.setInterval(() => {
          setWidth((current) => Math.min(current + trickleStep(current), 92))
        }, 600)
      }, 120)
    } else if (activeRef.current) {
      activeRef.current = false
      setWidth(100)
      timers.hide = window.setTimeout(() => setVisible(false), 220)
      timers.reset = window.setTimeout(() => setWidth(0), 500)
    }

    return clearAll
  }, [isNavigating])

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5 transition-opacity duration-200 ease-in-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className="h-full bg-navy-600 shadow-[0_0_8px] shadow-navy-600/50 transition-[width] duration-500 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
