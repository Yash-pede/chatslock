import React, { useEffect } from "react"
import { View } from "react-native"
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated"
import { cn } from "../lib/utils"

/** One bouncing dot. Motion is skipped when the OS asks for reduced motion. */
function Dot({ delay }: { delay: number }) {
  const translateY = useSharedValue(0)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) return
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 300 })),
        -1,
      ),
    )
    return () => cancelAnimation(translateY)
  }, [delay, translateY, reducedMotion])

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))

  return <Animated.View style={style} className="h-2 w-2 rounded-full bg-muted-foreground" />
}

export interface TypingIndicatorProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string
}

/** AniUI typing dots shown while the other participant is writing. */
export function TypingIndicator({ className, ...props }: TypingIndicatorProps) {
  return (
    <View
      className={cn(
        "flex-row items-center gap-1 self-start rounded-2xl rounded-bl-sm bg-secondary px-4 py-3",
        className,
      )}
      accessibilityLabel="Typing"
      accessibilityRole="progressbar"
      {...props}
    >
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  )
}
