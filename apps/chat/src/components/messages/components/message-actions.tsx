import { useState } from "react"
import { Copy, Download, Forward, Pencil, Pin, PinOff, Trash2, X } from "lucide-react-native"
import { Pressable, View } from "react-native"
import { Text, useThemeColors } from "@repo/ui"

function Action({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onPress?: () => void
  disabled?: boolean
}) {
  const [hintVisible, setHintVisible] = useState(false)

  return (
    <View>
      <Pressable
        onPress={onPress}
        onLongPress={() => setHintVisible(true)}
        onPressOut={() => setHintVisible(false)}
        delayLongPress={250}
        disabled={disabled || !onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
        className={`h-10 items-center justify-center rounded-full px-3 active:bg-background ${
          disabled ? "opacity-40" : ""
        }`}
      >
        {icon}
      </Pressable>
      {hintVisible ? (
        <View
          pointerEvents="none"
          className="absolute top-full mt-1 w-20 items-center self-center rounded-md bg-foreground px-2 py-0.5"
          style={{ zIndex: 10 }}
        >
          <Text variant="small" numberOfLines={1} className="leading-none text-background">
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

/**
 * Contextual bar for selected messages. It replaces the conversation header so
 * the list keeps its size. One selected message shows the single-message
 * actions; multiple selections show only Forward. The count sits on the left.
 * Icons reveal their label while long-pressed.
 */
export function MessageActions({
  count,
  canCopy,
  canDownload,
  canEdit,
  canDelete,
  starred,
  onCopy,
  onDownload,
  onToggleStar,
  onEdit,
  onDelete,
  onForward,
  onCancel,
}: {
  /** Number of selected messages; rendered on the left. */
  count: number
  canCopy?: boolean
  canDownload?: boolean
  canEdit?: boolean
  canDelete?: boolean
  /** Whether the single selected message is pinned in the local cache. */
  starred?: boolean
  onCopy?: () => void
  onDownload?: () => void
  onToggleStar?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onForward?: () => void
  onCancel: () => void
}) {
  const colors = useThemeColors()
  const multi = count > 1

  return (
    <View
      className="flex-row items-center justify-between border-b border-border px-2 py-2"
      style={{ zIndex: 30 }}
    >
      <View className="flex-row items-center gap-2">
        <Text variant="large" className="min-w-6 text-center text-base">
          {count}
        </Text>
        {!multi ? (
          <View className="flex-row items-center gap-1">
            {canCopy ? (
              <Action
                icon={<Copy size={18} color={colors.foreground} />}
                label="Copy"
                onPress={onCopy}
              />
            ) : null}
            {canDownload ? (
              <Action
                icon={<Download size={18} color={colors.foreground} />}
                label="Download"
                onPress={onDownload}
              />
            ) : null}
            <Action
              icon={
                starred ? (
                  <PinOff size={18} color={colors.foreground} />
                ) : (
                  <Pin size={18} color={colors.foreground} />
                )
              }
              label={starred ? "Unpin" : "Pin"}
              onPress={onToggleStar}
            />
            {canEdit ? (
              <Action
                icon={<Pencil size={18} color={colors.foreground} />}
                label="Edit"
                onPress={onEdit}
              />
            ) : null}
            {canDelete ? (
              <Action
                icon={<Trash2 size={18} color={colors.destructive} />}
                label="Delete"
                onPress={onDelete}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <View className="flex-row items-center gap-1">
        <Action
          icon={<Forward size={18} color={colors.foreground} />}
          label="Forward"
          onPress={onForward}
        />
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel selection"
          hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-background"
        >
          <X size={17} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  )
}
