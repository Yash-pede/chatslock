import { memo } from "react"
import { Image } from "expo-image"
import { Pressable, View } from "react-native"
import { FileText, Play } from "lucide-react-native"
import { ChatBubble, Text, cn, useThemeColors } from "@repo/ui"
import type { ChatMessage } from "@/components/messages/types"

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Fixed image width so rows keep a stable height while scrolling (no reflow jank). */
const IMAGE_MAX_WIDTH = 240

function VoiceWaveform({ waveform, tint }: { waveform: number[]; tint: string }) {
  return (
    <View className="h-6 flex-row items-center gap-[3px]">
      {waveform.map((bar, index) => (
        <View
          key={index}
          style={{ height: 4 + bar * 2, width: 3, borderRadius: 2, backgroundColor: tint }}
        />
      ))}
    </View>
  )
}

export interface MessageBubbleProps {
  message: ChatMessage
  /** Present when a failed message can be retried; makes the bubble tappable. */
  onRetry?: () => void
}

/**
 * Renders one message. Memoized and free of layout-affecting side effects so
 * FlashList can recycle rows without re-measuring.
 */
export const MessageBubble = memo(function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const colors = useThemeColors()
  const variant = message.isMine ? "sent" : "received"
  const time = clock(message.createdAt)
  const tint = message.isMine ? colors.primaryForeground : colors.secondaryForeground
  const subtle = message.isMine ? `${colors.primaryForeground}99` : colors.mutedForeground
  const failed = message.status === "failed"
  const failedClass = failed ? "border border-destructive/60 bg-destructive/10" : undefined

  const renderBubble = () => {
    if (message.isSystem) {
      return (
        <View className="items-center py-2">
          <View className="rounded-full bg-secondary px-3 py-1">
            <Text variant="small" className="font-normal text-muted-foreground">
              {message.text}
            </Text>
          </View>
        </View>
      )
    }

    if (message.kind === "image" && message.image) {
      const { width, height, url } = message.image
      const ratio = height > 0 ? width / height : 1
      const imageWidth = Math.min(IMAGE_MAX_WIDTH, width)
      const imageHeight = Math.round(imageWidth / ratio)

      return (
        <ChatBubble
          variant={variant}
          timestamp={time}
          status={message.status}
          className={cn("p-1 px-1 pb-1.5", failedClass)}
        >
          <Image
            source={{ uri: url }}
            style={{ width: imageWidth, height: imageHeight, borderRadius: 10 }}
            contentFit="cover"
            transition={120}
            accessibilityLabel="Photo"
          />
          {message.text ? (
            <Text className="mt-1 px-1.5 text-base" style={{ color: tint }}>
              {message.text}
            </Text>
          ) : null}
        </ChatBubble>
      )
    }

    if (message.kind === "file" && message.attachment) {
      const { fileName, sizeBytes } = message.attachment

      return (
        <ChatBubble
          variant={variant}
          timestamp={time}
          status={message.status}
          className={cn("w-[78%] max-w-[78%]", failedClass)}
        >
          <View className="flex-row items-center gap-3">
            <View
              className="h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `${tint}22` }}
            >
              <FileText size={18} color={tint} />
            </View>
            {/* min-w-0 lets the filename shrink and ellipsize instead of pushing the row. */}
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="text-sm font-medium leading-5"
                style={{ color: tint }}
              >
                {fileName}
              </Text>
              <Text className="text-xs leading-4" style={{ color: subtle }}>
                {formatSize(sizeBytes)}
              </Text>
            </View>
          </View>
        </ChatBubble>
      )
    }

    if (message.kind === "voice" && message.voice) {
      return (
        <ChatBubble
          variant={variant}
          timestamp={time}
          status={message.status}
          className={failedClass}
        >
          <View className="flex-row items-center gap-2.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Play voice message"
              className="h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: `${tint}22` }}
            >
              <Play size={15} color={tint} fill={tint} />
            </Pressable>
            <VoiceWaveform waveform={message.voice.waveform} tint={subtle} />
            <Text className="text-xs leading-4" style={{ color: subtle }}>
              {message.voice.durationSeconds}s
            </Text>
          </View>
        </ChatBubble>
      )
    }

    return (
      <ChatBubble
        variant={variant}
        timestamp={time}
        status={message.status}
        className={failedClass}
      >
        {message.text ?? ""}
      </ChatBubble>
    )
  }

  const bubble = renderBubble()

  if (failed && onRetry) {
    return (
      <View className="items-end">
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Message not sent. Tap to retry."
          className="active:opacity-70"
        >
          {bubble}
        </Pressable>
        <Text className="me-1 mt-0.5 text-[10px] text-destructive">Not sent · tap to retry</Text>
      </View>
    )
  }

  return bubble
})
