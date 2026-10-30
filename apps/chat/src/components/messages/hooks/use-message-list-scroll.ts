import { useCallback, useRef, useState } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"
import type { FlashListRef } from "@shopify/flash-list"

/** Below this many px from the bottom, the jump-to-latest button is hidden. */
const JUMP_THRESHOLD = 120
/** Within this many px of the top, the previous page is requested. */
const LOAD_OLDER_THRESHOLD = 200

/**
 * Scroll behaviour for the message list: tracks whether the user has scrolled
 * away from the newest message, and requests older pages near the top.
 */
export function useMessageListScroll<TChatMessage>({ onLoadOlder }: { onLoadOlder: () => void }) {
  const listRef = useRef<FlashListRef<TChatMessage>>(null)
  const [awayFromBottom, setAwayFromBottom] = useState(false)

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height)
      const away = distanceFromBottom > JUMP_THRESHOLD
      setAwayFromBottom((current) => (current === away ? current : away))

      if (contentOffset.y < LOAD_OLDER_THRESHOLD) onLoadOlder()
    },
    [onLoadOlder],
  )

  const scrollToBottom = useCallback((animated: boolean) => {
    listRef.current?.scrollToEnd({ animated })
  }, [])

  return {
    listRef,
    awayFromBottom,
    onScroll,
    scrollToBottom,
    onLoad: () => scrollToBottom(false),
  }
}
