import { memo, useState } from "react"
import { Image } from "expo-image"
import { Pressable, View } from "react-native"
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated"
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio"
import { Ban, FileText, Pause, Play, WifiOff } from "lucide-react-native"
import { ChatBubble, Spinner, Text, Waveform, cn, useThemeColors } from "@repo/ui"
import { useRealtime } from "@/context/RealtimeContext"
import { DownloadButton } from "./download-button"
import { LinkifiedText } from "./linkified-text"
import { MediaOfflinePlaceholder } from "./media-offline-placeholder"
import { useVideoThumbnail } from "../hooks/use-video-thumbnail"
import type { ChatMessage } from "../types"

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

/** A playable voice note with an ambient waveform that fills as it plays. */
function AudioBubble({
  voice,
  tint,
  subtle,
  variant,
  time,
  status,
  selected,
  failedClass,
  online,
  starred = false,
}: {
  voice: { url: string; durationSeconds: number; waveform: number[] }
  tint: string
  subtle: string
  variant: "sent" | "received"
  time: string
  status: ChatMessage["status"]
  selected?: boolean
  failedClass?: string
  online: boolean
  starred?: boolean
}) {
  const remote = voice.url.startsWith("http")
  const player = useAudioPlayer(remote && !online ? null : voice.url ? { uri: voice.url } : null)
  const audio = useAudioPlayerStatus(player)
  const durationSeconds = audio.duration > 0 ? audio.duration : voice.durationSeconds
  const progress = durationSeconds > 0 ? audio.currentTime / durationSeconds : 0

  const toggle = () => {
    if (audio.playing) {
      player.pause()
    } else {
      if (audio.didJustFinish || audio.currentTime >= durationSeconds) void player.seekTo(0)
      player.play()
    }
  }

  if (remote && !online) {
    return (
      <ChatBubble
        variant={variant}
        timestamp={time}
        status={status}
        starred={starred}
        className={cn(
          "w-[62%] max-w-[66%]",
          selected &&
            (variant === "sent"
              ? "border-2 border-primary-foreground/70 bg-primary/85"
              : "border-2 border-primary bg-secondary/85"),
          failedClass,
        )}
      >
        <View className="flex-row items-center gap-2.5">
          <View
            className="h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${tint}22` }}
          >
            <WifiOff size={15} color={tint} />
          </View>
          <Text className="flex-1 text-xs leading-4" style={{ color: subtle }}>
            Voice message unavailable offline
          </Text>
          <Text className="shrink-0 text-xs leading-4" style={{ color: subtle }}>
            {formatDuration(durationSeconds)}
          </Text>
        </View>
      </ChatBubble>
    )
  }

  return (
    <ChatBubble
      variant={variant}
      timestamp={time}
      status={status}
      starred={starred}
      className={cn(
        "w-[62%] max-w-[66%]",
        selected &&
          (variant === "sent"
            ? "border-2 border-primary-foreground/70 bg-primary/85"
            : "border-2 border-primary bg-secondary/85"),
        failedClass,
      )}
    >
      <View className="flex-row items-center gap-2.5">
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={audio.playing ? "Pause voice message" : "Play voice message"}
          className="h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${tint}22` }}
        >
          {audio.playing ? (
            <Pause size={15} color={tint} fill={tint} />
          ) : (
            <Play size={15} color={tint} fill={tint} />
          )}
        </Pressable>
        <Waveform
          mode="ambient"
          levels={voice.waveform}
          progress={progress}
          color={tint}
          className="flex-1"
          height={22}
        />
        <Text className="shrink-0 text-xs leading-4" style={{ color: subtle }}>
          {formatDuration(durationSeconds)}
        </Text>
      </View>
    </ChatBubble>
  )
}

function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0
  return `${Math.floor(safe / 60)}:${(safe % 60).toString().padStart(2, "0")}`
}

export interface MessageBubbleProps {
  message: ChatMessage
  /** Present when a failed message can be retried; makes the bubble tappable. */
  onRetry?: () => void
  /** Opens the full-screen media viewer at this message's photo/video. */
  onOpenMedia?: (id: string) => void
  /** Long-press selects the message for edit/delete. */
  onSelect?: () => void
  /** Highlights the currently selected bubble. */
  selected?: boolean
}

/** Photo bubble that shows a loader until the image has loaded. */
function BubbleImage({
  url,
  width,
  height,
  online,
}: {
  url: string
  width: number
  height: number
  online: boolean
}) {
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <MediaOfflinePlaceholder
        width={width}
        height={height}
        label={online ? "Couldn't load photo" : "Photo unavailable offline"}
      />
    )
  }

  return (
    <View style={{ width, height, borderRadius: 10, overflow: "hidden" }} className="bg-black/10">
      <Image
        source={{ uri: url }}
        style={{ width, height }}
        cachePolicy={"memory-disk"}
        contentFit="cover"
        transition={120}
        accessibilityLabel="Photo"
        onLoadStart={() => setLoading(true)}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false)
          setFailed(true)
        }}
      />
      {loading ? <Spinner className="absolute inset-0" color="#ffffff" /> : null}
    </View>
  )
}

/** Video poster with a play affordance; shows a loader until the poster is ready. */
function VideoPreview({
  url,
  width,
  height,
  online,
}: {
  url: string
  width: number
  height: number
  online: boolean
}) {
  const remote = url.startsWith("http")
  const canLoad = !remote || online
  const { thumbnail, loading } = useVideoThumbnail(canLoad ? url : "")

  if (!canLoad) {
    return (
      <MediaOfflinePlaceholder width={width} height={height} label="Video unavailable offline" />
    )
  }

  if (!loading && !thumbnail) {
    return (
      <MediaOfflinePlaceholder
        width={width}
        height={height}
        label={online ? "Video preview unavailable" : "Video unavailable offline"}
      />
    )
  }

  return (
    <View style={{ width, height, borderRadius: 10, overflow: "hidden" }} className="bg-black/80">
      {thumbnail ? <Image source={thumbnail} style={{ width, height }} contentFit="cover" /> : null}
      <View className="absolute inset-0 items-center justify-center">
        {loading ? (
          <Spinner color="#ffffff" />
        ) : (
          <View className="h-11 w-11 items-center justify-center rounded-full bg-black/50">
            <Play size={20} color="#ffffff" fill="#ffffff" />
          </View>
        )}
      </View>
    </View>
  )
}

/**
 * Renders one message. Memoized and free of layout-affecting side effects so
 * FlashList can recycle rows without re-measuring.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  onRetry,
  onOpenMedia,
  onSelect,
  selected = false,
}: MessageBubbleProps) {
  const colors = useThemeColors()
  const { online } = useRealtime()
  const variant = message.isMine ? "sent" : "received"
  const time = clock(message.createdAt)
  const starred = message.starred === true
  const tint = message.isMine ? colors.primaryForeground : colors.secondaryForeground
  const subtle = message.isMine ? `${colors.primaryForeground}99` : colors.mutedForeground
  const failed = message.status === "failed"
  const failedClass = failed ? "border border-destructive/60 bg-destructive/10" : undefined
  const selectedClass = selected
    ? message.isMine
      ? "border-2 border-primary-foreground/70 bg-primary/85"
      : "border-2 border-primary bg-secondary/85"
    : undefined
  // Springy pop when the message is picked; the style worklet owns the animation.
  const selectedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(selected ? 1.04 : 1, {
          damping: 15,
          stiffness: 260,
          mass: 0.6,
        }),
      },
    ],
  }))

  const renderBubble = () => {
    if (message.isDeleted) {
      return (
        <ChatBubble
          variant={variant}
          timestamp={time}
          status={message.status}
          starred={starred}
          className={cn(selectedClass, failedClass)}
        >
          <View className="flex-row items-center gap-1.5">
            <Ban size={15} color={tint} />
            <Text className="text-base leading-5" style={{ color: tint }}>
              Message deleted
            </Text>
          </View>
        </ChatBubble>
      )
    }

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

    if (message.type === "IMAGE" && message.image) {
      const { width, height, url } = message.image
      const ratio = height > 0 ? width / height : 1
      const imageWidth = Math.min(IMAGE_MAX_WIDTH, width)
      const imageHeight = Math.round(imageWidth / ratio)

      return (
        <ChatBubble
          variant={variant}
          timestamp={time}
          status={message.status}
          starred={starred}
          className={cn("p-1 px-1 pb-1.5", selectedClass, failedClass)}
        >
          <Pressable
            onPress={() => onOpenMedia?.(message.id)}
            onLongPress={onSelect}
            delayLongPress={250}
            disabled={!onOpenMedia && !onSelect}
            accessibilityRole="imagebutton"
            accessibilityLabel="Open photo"
            className="active:opacity-90"
          >
            <BubbleImage
              key={online ? "online" : "offline"}
              url={url}
              width={imageWidth}
              height={imageHeight}
              online={online}
            />
          </Pressable>
          {message.text ? (
            <LinkifiedText
              text={message.text}
              isMine={message.isMine}
              className="mt-1 px-1.5 text-base leading-5"
              style={{ color: tint }}
            />
          ) : null}
        </ChatBubble>
      )
    }

    if (message.video) {
      const ratio = message.video.height > 0 ? message.video.width / message.video.height : 1
      const videoWidth = Math.min(IMAGE_MAX_WIDTH, message.video.width)
      const videoHeight = Math.round(videoWidth / ratio)

      return (
        <ChatBubble
          variant={variant}
          timestamp={time}
          status={message.status}
          starred={starred}
          className={cn("p-1 px-1 pb-1.5", selectedClass, failedClass)}
        >
          <Pressable
            onPress={() => onOpenMedia?.(message.id)}
            onLongPress={onSelect}
            delayLongPress={250}
            disabled={!onOpenMedia && !onSelect}
            accessibilityRole="button"
            accessibilityLabel="Play video"
            className="active:opacity-90"
          >
            <VideoPreview
              key={online ? "online" : "offline"}
              url={message.video.url}
              width={videoWidth}
              height={videoHeight}
              online={online}
            />
          </Pressable>
        </ChatBubble>
      )
    }

    if (message.type === "DOC" && message.attachment) {
      const { fileName, sizeBytes, url, mimeType } = message.attachment

      return (
        <ChatBubble
          variant={variant}
          timestamp={time}
          status={message.status}
          starred={starred}
          className={cn("w-[78%] max-w-[78%]", selectedClass, failedClass)}
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
            {url.startsWith("http") && online ? (
              <DownloadButton url={url} fileName={fileName} mimeType={mimeType} tint={tint} />
            ) : null}
          </View>
        </ChatBubble>
      )
    }

    if (message.type === "AUDIO" && message.voice) {
      return (
        <AudioBubble
          key={online ? "online" : "offline"}
          voice={message.voice}
          tint={tint}
          subtle={subtle}
          variant={variant}
          time={time}
          status={message.status}
          selected={selected}
          failedClass={failedClass}
          online={online}
          starred={starred}
        />
      )
    }

    return (
      <ChatBubble
        variant={variant}
        timestamp={time}
        status={message.status}
        starred={starred}
        className={cn(selectedClass, failedClass)}
      >
        <LinkifiedText
          text={message.text ?? ""}
          isMine={message.isMine}
          className="text-base leading-5"
          style={{ color: tint }}
        />
      </ChatBubble>
    )
  }

  const bubble = renderBubble()

  if (failed && onRetry) {
    return (
      <Animated.View style={selectedStyle} className="items-end">
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Message not sent. Tap to retry."
          className="active:opacity-70"
        >
          {bubble}
        </Pressable>
        <Text className="me-1 mt-0.5 text-[10px] text-destructive">Not sent · tap to retry</Text>
      </Animated.View>
    )
  }

  if (!onSelect || failed) return <Animated.View style={selectedStyle}>{bubble}</Animated.View>

  return (
    <Animated.View style={selectedStyle}>
      <Pressable
        onLongPress={onSelect}
        delayLongPress={250}
        accessibilityRole="button"
        accessibilityLabel="Select message"
        className="active:opacity-90"
      >
        {bubble}
      </Pressable>
    </Animated.View>
  )
})
