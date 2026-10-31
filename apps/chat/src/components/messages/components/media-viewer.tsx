import { useCallback, useEffect, useMemo, useState } from "react"
import { Modal, Pressable, useWindowDimensions, View } from "react-native"
import { Image } from "expo-image"
import { useEvent } from "expo"
import { VideoView, useVideoPlayer } from "expo-video"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler"
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { Play, X } from "lucide-react-native"
import { Carousel, Spinner, Text } from "@repo/ui"
import { useVideoThumbnail } from "../hooks/use-video-thumbnail"
import type { MediaItem } from "../lib/media"

const MIN_SCALE = 1
const MAX_SCALE = 5
const DOUBLE_TAP_SCALE = 2.5

/** Keeps a translation within `bound` (clamped symmetrically around 0). */
function clamp(value: number, bound: number) {
  "worklet"
  return Math.min(bound, Math.max(-bound, value))
}

/**
 * Full-screen photo with pinch-to-zoom, drag-while-zoomed, and double-tap to
 * toggle zoom — matching the WhatsApp/Telegram viewers. `onZoomingChange`
 * reports whether the image is magnified so the pager can lock its swipe.
 */
function ZoomableImage({
  url,
  width,
  height,
  onZoomingChange,
}: {
  url: string
  width: number
  height: number
  onZoomingChange?: (zoomed: boolean) => void
}) {
  const [loading, setLoading] = useState(true)
  const [panEnabled, setPanEnabled] = useState(false)
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null)

  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)

  // The on-screen (contain) size of the image, used to bound panning so the
  // image can't be dragged away from the edges of the screen.
  const fit = useMemo(() => {
    if (!sourceSize?.width || !sourceSize?.height) return { width, height }
    const ratio = Math.min(width / sourceSize.width, height / sourceSize.height)
    return { width: sourceSize.width * ratio, height: sourceSize.height * ratio }
  }, [sourceSize, width, height])

  const reportZoom = useCallback(
    (zoomed: boolean) => {
      setPanEnabled(zoomed)
      onZoomingChange?.(zoomed)
    },
    [onZoomingChange],
  )

  const boundX = (s: number) => {
    "worklet"
    return Math.max(0, (fit.width * s - width) / 2)
  }
  const boundY = (s: number) => {
    "worklet"
    return Math.max(0, (fit.height * s - height) / 2)
  }

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })
    .onUpdate((e) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale))
      const ratio = next / savedScale.value
      const fx = e.focalX - width / 2
      const fy = e.focalY - height / 2
      scale.value = next
      translateX.value = clamp(fx - (fx - savedTranslateX.value) * ratio, boundX(next))
      translateY.value = clamp(fy - (fy - savedTranslateY.value) * ratio, boundY(next))
    })
    .onEnd(() => {
      savedScale.value = scale.value
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
      runOnJS(reportZoom)(scale.value > MIN_SCALE + 0.01)
    })

  const pan = Gesture.Pan()
    .enabled(panEnabled)
    .onStart(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })
    .onUpdate((e) => {
      translateX.value = clamp(savedTranslateX.value + e.translationX, boundX(scale.value))
      translateY.value = clamp(savedTranslateY.value + e.translationY, boundY(scale.value))
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e, success) => {
      if (!success) return
      if (scale.value > MIN_SCALE + 0.01) {
        scale.value = withTiming(1)
        translateX.value = withTiming(0)
        translateY.value = withTiming(0)
        savedScale.value = 1
        savedTranslateX.value = 0
        savedTranslateY.value = 0
        runOnJS(reportZoom)(false)
        return
      }
      const next = DOUBLE_TAP_SCALE
      const fx = e.x - width / 2
      const fy = e.y - height / 2
      scale.value = withTiming(next)
      translateX.value = withTiming(clamp(fx - fx * next, boundX(next)))
      translateY.value = withTiming(clamp(fy - fy * next, boundY(next)))
      savedScale.value = next
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
      runOnJS(reportZoom)(true)
    })

  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan))

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[{ width, height }, animatedStyle]}
        className="items-center justify-center"
      >
        <Image
          source={{ uri: url }}
          style={{ width, height }}
          contentFit="contain"
          onLoadStart={() => setLoading(true)}
          onLoad={(e) => {
            setSourceSize({ width: e.source.width, height: e.source.height })
            setLoading(false)
          }}
          onError={() => setLoading(false)}
        />
        {loading ? <Spinner className="absolute inset-0" color="#ffffff" size="lg" /> : null}
      </Animated.View>
    </GestureDetector>
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
  // While the current photo is magnified we lock paging so panning the image
  // doesn't trigger a swipe to the next item.
  const [zoomed, setZoomed] = useState(false)

  // Reset to the tapped item each time the viewer opens (derived during render).
  const [wasVisible, setWasVisible] = useState(visible)
  if (wasVisible !== visible) {
    setWasVisible(visible)
    setZoomed(false)
    if (visible) setIndex(initialIndex)
  }

  const handleZoomingChange = useCallback((value: boolean) => setZoomed(value), [])

  const pages = items.map((item) => (
    <View key={item.id} style={{ width, height }} className="items-center justify-center">
      {item.kind === "image" ? (
        <ZoomableImage
          url={item.url}
          width={width}
          height={height}
          onZoomingChange={handleZoomingChange}
        />
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
      <GestureHandlerRootView style={{ flex: 1 }}>
        {visible ? (
          <View className="flex-1 bg-black">
            <Carousel
              data={pages}
              itemWidth={width}
              showDots={false}
              initialIndex={initialIndex}
              onIndexChange={setIndex}
              scrollEnabled={!zoomed}
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
      </GestureHandlerRootView>
    </Modal>
  )
}
