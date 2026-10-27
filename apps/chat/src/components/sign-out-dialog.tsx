import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui"

/** Confirmation dialog before dropping the session. */
export function SignOutDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out?</AlertDialogTitle>
          <AlertDialogDescription>
            You will need your phone number to sign in again on this device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onPress={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive"
            onPress={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            Sign out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
