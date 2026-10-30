import { useEffect, useState } from "react"
import { Modal, Pressable, useWindowDimensions, View } from "react-native"
import { Image } from "expo-image"
import { useEvent } from "expo"
import { VideoView, useVideoPlayer } from "expo-video"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Play, X } from "lucide-react-native"
import { Carousel, Spinner, Text } from "@repo/ui"
import { useVideoThumbnail } from "../hooks/use-video-thumbnail"
import type { MediaItem } from "../lib/media"

/** Full-screen photo that shows a loader until the image has loaded. */
function FullImage({ url, width, height }: { url: string; width: number; height: number }) {
  const [loading, setLoading] = useState(true)
  return (
    <View style={{ width, height }} className="items-center justify-center">
      <Image
        source={{ uri: url }}
        style={{ width, height }}
        contentFit="contain"
        onLoadStart={() => setLoading(true)}
        onLoad={() => setLoading(false)}
        onError={() => setLoading(false)}
      />
      {loading ? <Spinner className="absolute inset-0" color="#ffffff" size="lg" /> : null}
    </View>
  )
}

/** A paused video's poster while its page is off-screen. */
function VideoPoster({ url, width, height }: { url: string; width: number; height: number }) {
  const { thumbnail, loading } = useVideoThumbnail(url)
  return (
    <View style={{ width, height }} className="items-center justify-center">
      {thumbnail ? (
        <Image source={thumbnail} style={{ width, height }} contentFit="contain" />
      ) : null}
      <View className="absolute inset-0 items-center justify-center">
        {loading ? (
          <Spinner color="#ffffff" size="lg" />
        ) : (
          <View className="h-14 w-14 items-center justify-center rounded-full bg-white/15">
            <Play size={26} color="#ffffff" fill="#ffffff" />
          </View>
        )}
      </View>
    </View>
  )
}

/** The active video page; owns the player so only one plays at a time. */
function ActiveVideo({ url, width, height }: { url: string; width: number; height: number }) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false
  })
  const { status } = useEvent(player, "statusChange", { status: player.status })

  useEffect(() => {
    player.play()
    return () => player.pause()
  }, [player])

  const loading = status === "idle" || status === "loading"

  return (
    <View style={{ width, height }} className="items-center justify-center">
      <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls />
      {loading ? <Spinner className="absolute inset-0" color="#ffffff" size="lg" /> : null}
    </View>
  )
}

export interface MediaViewerProps {
  items: MediaItem[]
  initialIndex: number
  visible: boolean
  onClose: () => void
}

/**
 * Full-screen photo/video viewer with horizontal swipe over the media that is
 * currently loaded in the conversation (no extra pages are fetched).
 */
export function MediaViewer({ items, initialIndex, visible, onClose }: MediaViewerProps) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [index, setIndex] = useState(initialIndex)

  // Reset to the tapped item each time the viewer opens (derived during render).
  const [wasVisible, setWasVisible] = useState(visible)
  if (wasVisible !== visible) {
    setWasVisible(visible)
    if (visible) setIndex(initialIndex)
  }

  const pages = items.map((item) => (
    <View key={item.id} style={{ width, height }} className="items-center justify-center">
      {item.kind === "image" ? (
        <FullImage url={item.url} width={width} height={height} />
      ) : items[index]?.id === item.id ? (
        <ActiveVideo url={item.url} width={width} height={height} />
      ) : (
        <VideoPoster url={item.url} width={width} height={height} />
      )}
    </View>
  ))

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent={false}
    >
      {visible ? (
        <View className="flex-1 bg-black">
          <Carousel
            data={pages}
            itemWidth={width}
            showDots={false}
            initialIndex={initialIndex}
            onIndexChange={setIndex}
          />

          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="absolute end-5 h-10 w-10 items-center justify-center rounded-full bg-white/10 active:opacity-70"
            style={{ top: insets.top + 12 }}
          >
            <X size={22} color="#ffffff" />
          </Pressable>

          {items.length > 1 ? (
            <View
              className="absolute self-center rounded-full bg-white/10 px-3 py-1"
              style={{ top: insets.top + 18 }}
            >
              <Text className="text-xs font-medium text-white">
                {index + 1} / {items.length}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Modal>
  )
}
