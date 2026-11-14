import { Pencil, Trash2, X } from "lucide-react-native"
import { Pressable, View } from "react-native"
import { Text, useThemeColors } from "@repo/ui"

function Action({
  icon,
  label,
  tint,
  onPress,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  tint: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:bg-background ${
        disabled ? "opacity-40" : ""
      }`}
    >
      {icon}
      <Text variant="small" style={{ color: tint }}>
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * Contextual bar for the single selected message. Only one message can be
 * selected at a time; the bar sits under the header so the list keeps its size.
 */
export function MessageActions({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onCancel,
}: {
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
  onCancel: () => void
}) {
  const colors = useThemeColors()

  return (
    <View className="flex-row items-center justify-between px-2 py-1">
      <View className="flex-row items-center gap-1">
        {canEdit ? (
          <Action
            icon={<Pencil size={15} color={colors.foreground} />}
            label="Edit"
            tint={colors.foreground}
            onPress={onEdit}
          />
        ) : null}
        {canDelete ? (
          <Action
            icon={<Trash2 size={15} color={colors.destructive} />}
            label="Delete"
            tint={colors.destructive}
            onPress={onDelete}
          />
        ) : null}
      </View>

      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel selection"
        hitSlop={10}
        className="h-8 w-8 items-center justify-center rounded-full active:bg-background"
      >
        <X size={17} color={colors.mutedForeground} />
      </Pressable>
    </View>
  )
}
