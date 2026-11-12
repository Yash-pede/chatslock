import { useEffect } from "react"
import { View } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated"
import { useThemeColors } from "@repo/ui"

/** One dot of the typing bubble; staggered so the three bounce in sequence. */
function TypingDot({ delay, color }: { delay: number; color: string }) {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 350 }), withTiming(0, { duration: 350 })),
        -1,
        false,
      ),
    )
  }, [delay, progress])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
    transform: [{ translateY: -progress.value * 3 }],
  }))

  return (
    <Animated.View
      style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, animatedStyle]}
    />
  )
}

/** Received-style bubble with three animated dots, shown after the last message. */
export function TypingBubble({ visible }: { visible: boolean }) {
  const colors = useThemeColors()

  if (!visible) return null

  return (
    <View className="mb-1 mt-1 flex-row items-center gap-1 self-start rounded-2xl rounded-bl-md bg-secondary px-4 py-3">
      <TypingDot delay={0} color={colors.mutedForeground} />
      <TypingDot delay={150} color={colors.mutedForeground} />
      <TypingDot delay={300} color={colors.mutedForeground} />
    </View>
  )
}
