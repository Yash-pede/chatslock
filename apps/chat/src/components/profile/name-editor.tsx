import { View } from "react-native"
import { UserRound } from "lucide-react-native"
import { Button, Input, Label, SaveButton, useThemeColors } from "@repo/ui"

/** Inline display-name editor; `onSave` rejects with a message on failure. */
export function NameEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  canSave,
}: {
  draft: string
  onChange: (value: string) => void
  onSave: () => Promise<void>
  onCancel: () => void
  canSave: boolean
}) {
  const colors = useThemeColors()

  return (
    <View className="gap-3 p-4">
      <Label>Display name</Label>
      <Input
        value={draft}
        onChangeText={onChange}
        autoFocus
        maxLength={50}
        returnKeyType="done"
        leadingIcon={<UserRound size={16} color={colors.mutedForeground} />}
        onSubmitEditing={() => void onSave()}
      />
      <View className="flex-row items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onPress={onCancel}>
          Cancel
        </Button>
        <SaveButton
          label="Save"
          savedLabel="Saved"
          onSave={onSave}
          contract
          resetAfter={1000}
          disabled={!canSave}
          className="min-w-28"
        />
      </View>
    </View>
  )
}
