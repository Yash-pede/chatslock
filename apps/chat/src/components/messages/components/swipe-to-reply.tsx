import { useCallback } from "react"
import { View } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { Reply } from "lucide-react-native"
import { useThemeColors } from "@repo/ui"

/** Past this horizontal drag distance (px) the row triggers a reply. */
const TRIGGER_X = 64
/** The reply icon starts this far outside the row so it only slides in on drag. */
const ICON_OFFSET_X = 48

/** Swipe the row right to reply, WhatsApp-style: the reply affordance slides in
 * from the left while the bubble follows the finger and springs back. */
export function SwipeToReply({
  children,
  onReply,
}: {
  children: React.ReactNode
  onReply: () => void
}) {
  const colors = useThemeColors()
  const translateX = useSharedValue(0)

  const handleReply = useCallback(() => {
    onReply()
  }, [onReply])

  const pan = Gesture.Pan()
    .activeOffsetX(20)
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      translateX.value = Math.max(0, Math.min(event.translationX, 120))
    })
    .onEnd(() => {
      if (translateX.value >= TRIGGER_X) scheduleOnRN(handleReply)
      translateX.value = withSpring(0, { damping: 69, stiffness: 700 })
    })

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  // The icon rides the same drag but starts off-screen on the left, so it is
  // only revealed as the bubble moves right.
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value - ICON_OFFSET_X }],
  }))

  return (
    <View className="overflow-hidden">
      <Animated.View className="absolute inset-y-0 left-0 justify-center" style={iconStyle}>
        <Reply size={20} color={colors.primary} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={bubbleStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  )
}
