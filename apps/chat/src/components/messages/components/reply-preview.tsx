import { Pressable, View } from "react-native"
import { X } from "lucide-react-native"
import { Text, useThemeColors } from "@repo/ui"
import type { ChatMessage } from "../types"

function previewText(message: ChatMessage): string {
  if (message.isDeleted) return "Message deleted"
  if (message.text) return message.text
  if (message.attachment?.fileName) return message.attachment.fileName
  if (message.video) return "Video"
  if (message.voice) return "Voice message"
  if (message.image) return "Photo"
  return "Message"
}

/** Reply bar above the composer: who is being replied to plus a one-line preview. */
export function ReplyPreview({
  message,
  replyingTo,
  onCancel,
}: {
  message: ChatMessage
  replyingTo: string
  onCancel: () => void
}) {
  const colors = useThemeColors()

  return (
    <View className="flex-row items-center gap-3 border-t border-border bg-card px-3 py-2">
      <View className="w-1 self-stretch rounded-full" style={{ backgroundColor: colors.primary }} />
      <View className="min-w-0 flex-1">
        <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
          Replying to {replyingTo}
        </Text>
        <Text numberOfLines={1} variant="muted" className="text-sm">
          {previewText(message)}
        </Text>
      </View>
      <Pressable
        onPress={onCancel}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Cancel reply"
      >
        <X size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
  )
}
