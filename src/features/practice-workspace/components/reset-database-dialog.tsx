import { RotateCcwIcon } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'

type ResetDatabaseDialogProps = {
  className?: string
  disabled?: boolean
  onReset: () => Promise<void>
}

export function ResetDatabaseDialog({
  className,
  disabled,
  onReset,
}: ResetDatabaseDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  async function confirmReset() {
    setIsResetting(true)
    await onReset()
    setIsResetting(false)
    setIsOpen(false)
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        // Half a rebuilt database is worse than either end of it, so the
        // dialog stays put until the rows are back.
        if (!isResetting) {
          setIsOpen(nextOpen)
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={className}
            disabled={disabled}
          />
        }
      >
        <RotateCcwIcon data-icon="inline-start" />
        Reset
      </DialogTrigger>

      {/* Cancel takes the focus so a stray Enter key closes rather than wipes. */}
      <DialogContent
        showCloseButton={!isResetting}
        initialFocus={cancelRef}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Reset database?</DialogTitle>

          <DialogDescription>
            This will put the practice database back to how it was when you
            first opened the app: 10,000 customers, 5,000 products, 100,000
            orders, and 300,000 order items.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Everything you have done in the SQL editor is thrown away. Rows you
          inserted, updated, or deleted, tables you created, and indexes you
          added will be gone.
        </p>

        <p className="text-sm text-muted-foreground">
          This cannot be undone. The reset takes a few seconds to finish.
        </p>

        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="outline" ref={cancelRef} />}
            disabled={isResetting}
          >
            Cancel
          </DialogClose>

          <Button
            type="button"
            variant="destructive"
            disabled={isResetting}
            onClick={() => {
              void confirmReset()
            }}
          >
            {isResetting ? (
              <>
                <Spinner data-icon="inline-start" />
                Resetting…
              </>
            ) : (
              'Reset database'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
